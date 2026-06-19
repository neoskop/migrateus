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
import { spawn, ChildProcess } from 'node:child_process';
import portfinder from 'portfinder';

/**
 * Builds `ssh` args for a local port-forward from a DOCKER_HOST ssh URL.
 * `ssh://user@host:2222` → `-p 2222 user@host` plus the `-L` mapping. The
 * `target` is the `host:port` the Dokploy host should connect the forward to.
 */
export function buildSshForwardArgs(
  dockerHost: string,
  localPort: number,
  target: string,
): string[] {
  const url = new URL(dockerHost);
  const userHost = url.username
    ? `${url.username}@${url.hostname}`
    : url.hostname;
  const args = [
    '-N',
    '-L',
    `127.0.0.1:${localPort}:${target}`,
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
  ];
  if (url.port) {
    args.push('-p', url.port);
  }
  args.push(userHost);
  return args;
}

@Injectable()
export class DockerService {
  public networks: string[];
  public containerConfig: ContainerConfig;
  private directusTunnel?: ChildProcess;

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
   * (`DOCKER_HOST=ssh://…`, e.g. Dokploy): open an SSH local-forward to the
   * Directus container and return the chosen local port, so the rest of the
   * code keeps talking to `localhost:<port>` unchanged.
   */
  public async forwardDirectus(): Promise<number> {
    const host = this.dockerHost;
    if (!host || !host.startsWith('ssh://')) {
      return 8055;
    }

    const localPort = await portfinder.getPortPromise();
    const target = this.resolveTunnelTarget();
    this.logger.debug(
      `Opening SSH tunnel 127.0.0.1:${chalk.bold(localPort)} → ${chalk.bold(target)} on ${chalk.bold(host)}`,
    );

    this.directusTunnel = spawn('ssh', buildSshForwardArgs(host, localPort, target), {
      stdio: ['ignore', 'ignore', 'inherit'],
      detached: true,
    });
    this.directusTunnel.unref();

    await this.waitForDirectus(localPort, target);
    return localPort;
  }

  public stopForwardDirectus(): void {
    if (!this.directusTunnel) {
      return;
    }
    try {
      this.directusTunnel.kill('SIGKILL');
    } catch (e: any) {
      this.logger.warn(`Failed to stop Directus SSH tunnel: ${e?.message ?? e}`);
    }
    this.directusTunnel = undefined;
  }

  /**
   * Where the Dokploy host should connect the forward to. Prefer a
   * host-published 8055 (always routable from the host); otherwise the
   * container's IP on its first network (works when the host routes to the
   * docker/overlay network).
   */
  private resolveTunnelTarget(): string {
    const ports = this.containerConfig.NetworkSettings.Ports ?? {};
    const published = ports['8055/tcp']?.[0]?.HostPort;
    if (published) {
      return `localhost:${published}`;
    }

    const networks = this.containerConfig.NetworkSettings.Networks ?? {};
    const ip = Object.values(networks)
      .map((network) => network?.IPAddress)
      .find((address): address is string => Boolean(address));
    if (!ip) {
      throw new Error(
        'Could not determine the Directus container address for the SSH tunnel: ' +
          'no host-published 8055 and no container IP found.',
      );
    }
    return `${ip}:8055`;
  }

  /** Polls the forwarded port until Directus answers, or fails with guidance. */
  private async waitForDirectus(port: number, target: string): Promise<void> {
    const deadline = Date.now() + 20000;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        // Any HTTP response means the tunnel carries traffic to Directus.
        await fetch(`http://127.0.0.1:${port}/server/ping`);
        return;
      } catch (e: any) {
        lastError = e?.message ?? String(e);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error(
      `SSH tunnel is up but Directus is unreachable at http://127.0.0.1:${port} ` +
        `(forwarding to ${target}). The Dokploy host likely cannot route to the ` +
        `container — publish Directus' port 8055 on the host, or expose Directus ` +
        `at a public URL. Last error: ${lastError}`,
    );
  }
}
