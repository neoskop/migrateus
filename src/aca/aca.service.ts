import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
// NOTE: az command shapes are UNVERIFIED against a live Azure subscription.

import { Inject, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service.js';
import { AcaEnvironment } from '../config/environment.interface.js';
import { SqlService } from '../sql/sql.service.js';
import { exec, throwIfFailed } from '../util/exec.js';
import { shquote } from '../util/sh-quote.js';
import { spawn } from 'node:child_process';
import { ExecOptions, ExecOutputReturnValue } from 'shelljs';
import { DatabaseConfig } from '../backup-db/database-config.interface.js';

@Injectable()
export class AcaService {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly environmentService: EnvironmentService,
    private readonly sqlService: SqlService,
  ) {}

  public get acaEnv(): AcaEnvironment['aca'] {
    return (this.environmentService.environment as AcaEnvironment).aca;
  }

  private azCommand(args: string): string {
    const { subscription } = this.acaEnv;
    return `az ${args} --subscription ${subscription}`;
  }

  public async az(
    args: string,
    opts: ExecOptions = { silent: true },
  ): Promise<ExecOutputReturnValue> {
    return exec(this.azCommand(args), opts);
  }

  /**
   * Run an interactive `az containerapp exec` under a pseudo-terminal.
   *
   * `az containerapp exec` is SSH-style: on connect it calls
   * `tty.setcbreak(sys.stdin.fileno())`, which throws
   * `termios.error (25) Inappropriate ioctl for device` whenever stdin is not a
   * TTY — i.e. every scripted/headless run. The inner `--command` then never
   * runs, so there is no output to parse. `script -qec <cmd> /dev/null`
   * allocates a PTY so the connect succeeds and the command output is captured
   * as usual. Uses util-linux `script` (Linux); a BSD/macOS host would need the
   * `script -q /dev/null <cmd>` argument order instead.
   */
  public async azExec(
    args: string,
    opts: ExecOptions = { silent: true },
  ): Promise<ExecOutputReturnValue> {
    const command = `script -qec ${shquote(this.azCommand(args))} /dev/null`;
    const maxAttempts = 5;
    let output = await exec(command, opts);
    for (let attempt = 1; attempt < maxAttempts && this.isTransientExecError(output); attempt++) {
      this.logger.debug(
        `az containerapp exec hit a transient connection error; retry ${attempt}/${maxAttempts - 1}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      output = await exec(command, opts);
    }
    return output;
  }

  /**
   * Like {@link azExec}, but streams `input` to the inner command's stdin over
   * the exec websocket instead of carrying data in the command itself.
   *
   * `az containerapp exec` ships `--command` in the websocket *handshake URL*,
   * which Azure caps (~8 KiB → `Handshake status 414 URI Too Long`). So a bulk
   * payload can't ride the command, and a single argument can't either (local
   * `MAX_ARG_STRLEN` is 128 KiB). The interactive *stream* has no such limit —
   * backup already proves ~tens of MB flow over it (as stdout). Here we keep the
   * command tiny (e.g. `base64 -d > file`) and push the bytes through stdin: the
   * `script` PTY forwards our stdin to the in-container command, EOF on close.
   *
   * `input` must be PTY-safe: base64 text wrapped with `\n` (no control bytes;
   * lines under the canonical-mode limit). Echo comes back on stdout — ignored.
   */
  public async azExecStream(
    args: string,
    input: Buffer,
  ): Promise<ExecOutputReturnValue> {
    const command = this.azCommand(args);
    const maxAttempts = 5;
    let output = await this.spawnStream(command, input);
    for (
      let attempt = 1;
      attempt < maxAttempts && this.isTransientExecError(output);
      attempt++
    ) {
      this.logger.debug(
        `az containerapp exec (stream) hit a transient connection error; retry ${attempt}/${maxAttempts - 1}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      output = await this.spawnStream(command, input);
    }
    return output;
  }

  /** Spawn `script -qec <azcmd> /dev/null`, feed `input` to its stdin with
   * backpressure, and resolve once it closes. stdout is drained (the PTY echoes
   * the whole input back) but not retained; stderr is kept (capped) so transient
   * websocket faults are still detectable. */
  private spawnStream(
    command: string,
    input: Buffer,
  ): Promise<ExecOutputReturnValue> {
    return new Promise((resolve) => {
      const child = spawn('script', ['-qec', command, '/dev/null']);
      let stderr = '';
      child.stdout.on('data', () => {});
      child.stderr.on('data', (d: Buffer) => {
        stderr = (stderr + d.toString()).slice(-65536);
      });
      child.stdin.on('error', () => {}); // EPIPE if the child died early
      child.on('error', (err) =>
        resolve({ code: 1, stdout: '', stderr: stderr || String(err) }),
      );
      child.on('close', (code) =>
        resolve({ code: code ?? 1, stdout: '', stderr }),
      );

      const CH = 64 * 1024;
      const pump = async () => {
        for (let i = 0; i < input.length; i += CH) {
          if (!child.stdin.write(input.subarray(i, i + CH))) {
            await new Promise((r) => child.stdin.once('drain', r));
          }
        }
      };
      pump().finally(() => child.stdin.end());
    });
  }

  /**
   * True when `az containerapp exec` failed to *establish* the session (so the
   * inner command never ran) rather than the command itself failing. These are
   * intermittent Azure-side faults and safe to retry — the command didn't run,
   * so even non-idempotent commands won't be double-applied.
   */
  private isTransientExecError(output: ExecOutputReturnValue): boolean {
    if (output.code === 0) {
      return false;
    }
    const text = `${output.stdout}\n${output.stderr}`;
    return /(WebSocketBadStatusException|Handshake status|ClusterExecEndpointWebSocketConnectionError|failed to establish.*WebSocket|The command failed with an unexpected error)/i.test(
      text,
    );
  }

  public async setup(): Promise<void> {
    const { app, resourceGroup } = this.acaEnv;

    const result = throwIfFailed(
      await this.az(
        `containerapp show -n ${app} -g ${resourceGroup} --query "properties.template.containers[0].env" -o json`,
      ),
      (o) =>
        `Failed to read ACA app config for ${app} (code ${o.code}): ${o.stderr}`,
    );

    const envArray: Array<{
      name: string;
      value?: string;
      secretRef?: string;
    }> = JSON.parse(result.stdout);

    // Secret-backed env vars (e.g. DB_PASSWORD) carry only a `secretRef`, not a
    // value. Resolve the actual secret values so the sidecar can authenticate —
    // without this the DB password is empty and every SQL statement silently
    // fails against a password-protected engine (Postgres).
    const secrets = envArray.some((e) => e.secretRef !== undefined)
      ? await this.loadSecrets(app, resourceGroup)
      : {};

    const envMap: Record<string, string> = {};
    for (const entry of envArray) {
      if (entry.secretRef !== undefined) {
        const value = secrets[entry.secretRef];
        if (value === undefined) {
          this.logger.warn(
            `ACA secret ${entry.secretRef} (for ${entry.name}) could not be resolved; using empty string`,
          );
        }
        envMap[entry.name] = value ?? '';
      } else {
        envMap[entry.name] = entry.value ?? '';
      }
    }

    const config: DatabaseConfig = {
      host: envMap['DB_HOST'] ?? '',
      port: envMap['DB_PORT'] ?? '',
      name: envMap['DB_DATABASE'] ?? '',
      user: envMap['DB_USER'] ?? '',
      password: envMap['DB_PASSWORD'] ?? '',
    };

    if (envMap['DB_CLIENT']) {
      config.client = envMap['DB_CLIENT'] as DatabaseConfig['client'];
    }

    if (envMap['DB_FILENAME']) {
      config.filename = envMap['DB_FILENAME'];
    }

    this.sqlService.databaseConfig = config;
  }

  /**
   * Resolves every secret of the Directus container app to its value, keyed by
   * secret name, so secret-backed env vars (`secretRef`) can be dereferenced.
   * `--show-values` is required; the call is silent so values never hit the log.
   */
  private async loadSecrets(
    app: string,
    resourceGroup: string,
  ): Promise<Record<string, string>> {
    const result = throwIfFailed(
      await this.az(
        `containerapp secret list -n ${app} -g ${resourceGroup} --show-values -o json`,
      ),
      (o) => `Failed to read ACA secrets for ${app} (code ${o.code}): ${o.stderr}`,
    );

    const secrets: Array<{ name: string; value?: string }> = JSON.parse(
      result.stdout,
    );
    const map: Record<string, string> = {};
    for (const secret of secrets) {
      if (secret.value !== undefined) {
        map[secret.name] = secret.value;
      }
    }
    return map;
  }

  /**
   * The externally-reachable base URL of the Directus app, derived from its ACA
   * ingress FQDN. ACA has no port-forward; the app is published over HTTPS
   * ingress, and the platform proxies `localhost:<port>` to this URL.
   */
  public async getDirectusBaseUrl(): Promise<string> {
    const { app, resourceGroup } = this.acaEnv;
    const result = throwIfFailed(
      await this.az(
        `containerapp show -n ${app} -g ${resourceGroup} --query "properties.configuration.ingress.fqdn" -o tsv`,
      ),
      (o) =>
        `Failed to read ACA ingress FQDN for ${app} (code ${o.code}): ${o.stderr}`,
    );

    const fqdn = result.stdout.trim();
    if (!fqdn) {
      throw new Error(
        `ACA app ${app} has no external ingress FQDN; cannot reach Directus over HTTP.`,
      );
    }
    return `https://${fqdn}`;
  }

  public async execInDirectus(command: string): Promise<ExecOutputReturnValue> {
    const { app, resourceGroup } = this.acaEnv;
    // `az containerapp exec --command` does NOT run its value through a shell:
    // it splits the value on whitespace and execs the resulting argv directly.
    // So a plain `/bin/sh -c '<command>'` is shattered — every word becomes its
    // own argv entry and the `'…'` quoting is taken literally (you get
    // `sh -c "'node"` → `unterminated quoted string`). To still run <command>
    // through a real shell (which strips the quoting docker/k8s rely on), hide
    // every space as `${IFS}` so the whole script survives the word-split as ONE
    // argv word; the in-container sh then expands `${IFS}`, re-splits into the
    // intended argv, and removes the quotes. Relies on no command TOKEN holding
    // a literal space (true for all callers: nanoid ids, UUIDs, emails).
    const script = command.replaceAll(' ', '${IFS}');
    return this.azExec(
      `containerapp exec -n ${app} -g ${resourceGroup} --command ${shquote('/bin/sh -c ' + script)}`,
    );
  }

  public async restartDirectus(): Promise<void> {
    const { app, resourceGroup } = this.acaEnv;
    // `revision restart` requires the revision name. Restart the active one
    // (in single-revision/default mode that is `latestRevisionName`). Best
    // effort: the restore data is already applied by the time this runs, so a
    // restart failure must not mask a successful restore — warn, don't throw.
    const show = await this.az(
      `containerapp show -n ${app} -g ${resourceGroup} --query "properties.latestRevisionName" -o tsv`,
    );
    const revision = show.stdout.trim();
    if (!revision) {
      this.logger.warn(
        `Could not determine the active revision for ${app}; skipping Directus restart.`,
      );
      return;
    }

    const result = await this.az(
      `containerapp revision restart -n ${app} -g ${resourceGroup} --revision ${revision}`,
    );
    if (result.code !== 0) {
      this.logger.warn(
        `Failed to restart Directus revision ${revision} (code ${result.code}): ${result.stderr}`,
      );
    }
  }
}
