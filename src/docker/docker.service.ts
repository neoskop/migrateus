import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ContainerConfig } from './container-config.type.js';
import { EnvironmentService } from '../environment/environment.service.js';
import {
  DockerComposeEnvironment,
  DockerEnvironment,
} from '../config/environment.interface.js';
import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { SqlService } from '../sql/sql.service.js';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';
import { exec } from '../util/exec.js';
import { shquote } from '../util/sh-quote.js';
import { spawn } from 'node:child_process';
import net from 'node:net';
import portfinder from 'portfinder';

/**
 * A tiny TCP→stdio relay run via `node -e` INSIDE the Directus container: it
 * connects to Directus on 127.0.0.1:8055 (reachable from inside the container)
 * and bridges that socket to the process's stdin/stdout, so a `docker exec -i`
 * attach becomes a transparent byte pipe to Directus. Double-quoted internals
 * keep it safe inside the single-quoted shell argument.
 */
export const DIRECTUS_TCP_RELAY =
  'const n=require("net");const c=n.connect(8055,"127.0.0.1");' +
  'process.stdin.pipe(c);c.pipe(process.stdout);' +
  'c.on("error",()=>process.exit(1));c.on("close",()=>process.exit(0));';

@Injectable()
export class DockerService {
  public networks: string[];
  public containerConfig: ContainerConfig;
  private directusTunnelServer?: net.Server;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly environmentService: EnvironmentService,
    private readonly sqlService: SqlService,
  ) {}

  public async setup() {
    this.containerConfig = await this.getContainerConfig();
    this.logger.debug(
      `Container config: ${highlight(JSON.stringify(this.containerConfig), { language: 'json' })}`,
    );
    this.networks = Object.keys(this.containerConfig.NetworkSettings.Networks);
    this.logger.debug(
      `Setting database config: ${highlight(JSON.stringify(this.databaseConfig), { language: 'json' })}`,
    );
    this.sqlService.databaseConfig = this.databaseConfig;
    await this.ensureDatabaseContainerIsRunning();
    await this.ensureDirectusContainerIsRunning();
  }

  public get databaseConfig(): DatabaseConfig {
    const client = this.getOptionalDockerEnvValue('DB_CLIENT');
    const filename = this.getOptionalDockerEnvValue('DB_FILENAME');

    // SQLite is file-based — it has no DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/
    // DB_DATABASE. Read the connection fields optionally for sqlite (defaulting
    // to ''), but keep them required for server engines so a misconfigured
    // mysql/pg environment still fails fast.
    const read =
      client === 'sqlite3'
        ? (name: string) => this.getOptionalDockerEnvValue(name) ?? ''
        : (name: string) => this.getDockerEnvValue(name);

    return {
      host: read('DB_HOST'),
      port: read('DB_PORT'),
      name: read('DB_DATABASE'),
      user: read('DB_USER'),
      password: read('DB_PASSWORD'),
      ...(client ? { client: client as DatabaseConfig['client'] } : {}),
      ...(filename ? { filename } : {}),
    };
  }

  private async getContainerConfig() {
    let containerName: string;

    switch (this.environmentService.environment.platform) {
      case 'docker': {
        const env = this.environmentService.environment as DockerEnvironment;
        if (env.containerName) {
          containerName = env.containerName;
        } else if (env.service) {
          containerName = await this.getSwarmServiceContainerId(env.service);
        } else {
          throw new Error(
            'A `docker` environment requires either `containerName` or `service`',
          );
        }
        break;
      }

      case 'docker-compose':
        containerName = await this.getComposeContainerName();
        break;

      default:
        throw new Error(
          `Unsupported platform ${chalk.bold(this.environmentService.environment.platform)}`,
        );
    }

    const inspectOutput = await exec(
      this.withHost(`docker inspect ${containerName}`),
      {
        silent: true,
      },
    );

    if (inspectOutput.code !== 0) {
      throw new Error(
        `Failed to get container config with code ${inspectOutput.code}: ${inspectOutput.stderr}`,
      );
    }

    return JSON.parse(inspectOutput.stdout)[0] as ContainerConfig;
  }

  private async getSwarmServiceContainerId(service: string): Promise<string> {
    // Dokploy (and any Docker Swarm) runs a service as task containers labelled
    // `com.docker.swarm.service.name`. Resolve the running task container's id.
    const psOutput = await exec(
      this.withHost(
        `docker ps --filter "label=com.docker.swarm.service.name=${service}" --format "{{.ID}}"`,
      ),
      { silent: true },
    );

    if (psOutput.code !== 0) {
      throw new Error(
        `Failed to resolve service ${chalk.bold(service)} with code ${psOutput.code}: ${psOutput.stderr}`,
      );
    }

    const containerId = psOutput.stdout.split('\n').filter(Boolean)[0];

    if (!containerId) {
      throw new Error(
        `No running container found for service ${chalk.bold(service)}`,
      );
    }

    return containerId;
  }

  private async getComposeContainerName(): Promise<string> {
    const env = this.environmentService.environment as DockerComposeEnvironment;
    const psOutput = await exec(
      this.withHost(
        `docker compose -f ${env.composeFile || 'docker-compose.yml'} ps -a --format '{{.Name}}' ${env.serviceName || 'directus'}`,
      ),
      {
        silent: true,
      },
    );

    if (psOutput.code !== 0) {
      throw new Error(
        `Failed to get container name from docker compose with code ${psOutput.code}: ${psOutput.stderr}`,
      );
    }

    return psOutput.stdout.trim();
  }

  private getDockerEnvValue(name: string) {
    const variable = this.containerConfig.Config.Env.find((env: string) =>
      env.startsWith(`${name}=`),
    );

    if (!variable) {
      throw new Error(`Environment variable ${name} not found`);
    }

    return variable.split('=')[1];
  }

  private getOptionalDockerEnvValue(name: string): string | undefined {
    const variable = this.containerConfig.Config.Env.find((env: string) =>
      env.startsWith(`${name}=`),
    );

    if (!variable) {
      return undefined;
    }

    return variable.split('=')[1];
  }

  private async ensureDatabaseContainerIsRunning() {
    // A file-based engine (sqlite) has no separate database container — the DB
    // file lives inside the Directus container, which is ensured running on its
    // own below. Skip when there is no host: otherwise the name filter
    // (`Name.includes(host)`) matches every container (`includes('')` is always
    // true) and tries to start them all.
    if (!this.databaseConfig.host) {
      return;
    }

    const containersOutput = (
      await exec(this.withHost('docker ps -a --format json'), {
        silent: true,
      })
    ).stdout;
    const containers = containersOutput
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return Promise.all(
      containers
        .filter(({ Networks }: { Networks: string }) =>
          Networks.split(',').some((network: string) =>
            this.networks.includes(network),
          ),
        )
        .filter(({ State }: { State: string }) => State !== 'running')
        .filter(({ Names }: { Names: string }) =>
          Names.split(',').some((Name: string) =>
            Name.includes(this.databaseConfig.host),
          ),
        )
        .map(async ({ ID }: { ID: string }) => {
          this.logger.debug(
            `Starting database container ${chalk.bold(ID)} since it is not running`,
          );
          await exec(this.withHost(`docker start ${ID}`), { silent: true });
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }),
    );
  }

  private async ensureDirectusContainerIsRunning() {
    if (this.containerConfig.State.Running) {
      return;
    }

    this.logger.debug(
      `Starting Directus container ${chalk.bold(this.containerConfig.Id)} since it is not running`,
    );
    await exec(this.withHost(`docker start ${this.containerConfig.Id}`), {
      silent: true,
    });
    await this.waitUntilDirectusIsRunning();
  }

  private async waitUntilDirectusIsRunning() {
    const maxAttempts = 50;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const healtCheckUrl = 'http://localhost:8055/server/health';
        this.logger.debug(
          `Polling server health with ${chalk.green('GET')} ${chalk.bold(healtCheckUrl)}`,
        );
        const response = await fetch(healtCheckUrl);

        if (!response?.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const { status } = await response.json();

        if (status === 'ok') {
          return;
        }
      } catch (error: any) {
        this.logger.debug(
          `Server health check failed: ${error.message || error}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Failed to start Directus container');
  }

  public get directusStorageRoot(): string | undefined {
    return this.getOptionalDockerEnvValue('STORAGE_LOCAL_ROOT');
  }

  public get directusStorageIsLocal(): boolean {
    const locations = this.getOptionalDockerEnvValue('STORAGE_LOCATIONS');
    // Directus defaults to 'local' when unset; treat unset OR a comma list containing 'local' as local.
    return (
      !locations ||
      locations
        .split(',')
        .map((s) => s.trim())
        .includes('local')
    );
  }

  public async execInDirectus(command: string) {
    const full = this.withHost(
      `docker exec ${this.containerConfig.Id} /bin/sh -c ${shquote(command)}`,
    );
    const out = await exec(full, { silent: true });
    if (out.code !== 0) {
      // Directus logs errors via pino to STDOUT, not stderr, so include both —
      // otherwise real failures (e.g. a CLI NOT_NULL_VIOLATION) are masked.
      const detail = [out.stdout, out.stderr]
        .map((stream) => stream?.trim())
        .filter(Boolean)
        .join('\n');
      throw new Error(`Directus exec failed with code ${out.code}: ${detail}`);
    }
    return out;
  }

  public async restartDirectus() {
    await exec(this.withHost(`docker restart ${this.containerConfig.Id}`), {
      silent: true,
    });
  }

  public withHost(command: string): string {
    const host = this.dockerHost;
    return host ? `DOCKER_HOST=${host} ${command}` : command;
  }

  private get dockerHost(): string | undefined {
    const env = this.environmentService.environment as
      | DockerEnvironment
      | DockerComposeEnvironment;
    return env?.host;
  }

  /**
   * Resolves the Directus HTTP port to a locally-reachable one.
   *
   * Local docker (no DOCKER_HOST, or a `tcp://` host): Directus' 8055 is
   * already reachable on localhost → return 8055. Remote docker over SSH
   * (`DOCKER_HOST=ssh://…`, e.g. Dokploy): a raw `ssh -L` can't reach the
   * container on a Swarm overlay network (the host doesn't route to overlay
   * IPs). Instead start a local TCP listener that pipes each connection through
   * `docker exec -i … node -e <relay>` to Directus on 127.0.0.1:8055 *inside*
   * the container — reusing the SSH/docker channel that already works — and
   * return the local port so the rest of the code keeps talking to localhost.
   */
  public async forwardDirectus(): Promise<number> {
    const host = this.dockerHost;
    if (!host || !host.startsWith('ssh://')) {
      return 8055;
    }

    const localPort = await portfinder.getPortPromise();
    this.logger.debug(
      `Forwarding 127.0.0.1:${chalk.bold(localPort)} → Directus via docker exec on ${chalk.bold(host)}`,
    );
    this.directusTunnelServer = this.createDockerExecTunnel(localPort);
    await this.waitForDirectus(localPort);
    return localPort;
  }

  public stopForwardDirectus(): void {
    if (!this.directusTunnelServer) {
      return;
    }
    this.directusTunnelServer.close();
    this.directusTunnelServer = undefined;
  }

  /** The `docker exec -i … node -e <relay>` command, host-prefixed and quoted. */
  private relayCommand(): string {
    return this.withHost(
      `docker exec -i ${this.containerConfig.Id} node -e ${shquote(DIRECTUS_TCP_RELAY)}`,
    );
  }

  /**
   * A local TCP server whose every connection is bridged, via a fresh
   * `docker exec` attach, to Directus inside the container. HTTP keep-alive
   * (undici's default) reuses a connection, so one exec serves many requests.
   */
  private createDockerExecTunnel(localPort: number): net.Server {
    const command = this.relayCommand();
    const server = net.createServer((socket) => {
      const child = spawn('sh', ['-c', command], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      socket.pipe(child.stdin);
      child.stdout.pipe(socket);
      const killChild = () => {
        try {
          child.kill();
        } catch {
          // already exited
        }
      };
      socket.on('error', killChild);
      socket.on('close', killChild);
      child.on('error', () => socket.destroy());
      child.on('exit', () => socket.destroy());
    });
    server.listen(localPort, '127.0.0.1');
    return server;
  }

  /** Polls the forwarded port until Directus answers, or fails with guidance. */
  private async waitForDirectus(port: number): Promise<void> {
    const deadline = Date.now() + 20000;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        // Per-attempt timeout: without it a stalled connection hangs forever
        // (Node's fetch has no default timeout).
        await fetch(`http://127.0.0.1:${port}/server/ping`, {
          signal: AbortSignal.timeout(3000),
        });
        return;
      } catch (e: any) {
        lastError = e?.message ?? String(e);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error(
      `Directus is unreachable through the docker-exec tunnel at ` +
        `http://127.0.0.1:${port} after 20s. Verify Directus listens on ` +
        `127.0.0.1:8055 inside the container. Last error: ${lastError}`,
    );
  }
}
