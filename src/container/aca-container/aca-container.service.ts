import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import { customAlphabet } from 'nanoid/non-secure';
import { AcaService } from '../../aca/aca.service.js';
import fs from 'node:fs';
import { ExecOutputReturnValue } from 'shelljs';
import { throwIfFailed } from '../../util/exec.js';
import { shquote } from '../../util/sh-quote.js';

/**
 * `az containerapp exec` brackets the command's real output with its own
 * SSH-style banner on stdout (`Connecting to the container …`, `Successfully
 * connected …`, `Use ctrl + D to exit.`, `Disconnecting …`) — ANSI-coloured
 * and with trailing `\r` from the PTY. Strip the colour codes and drop the
 * banner lines so strict consumers (UUID parsing, table lists) see only the
 * command's real output.
 */
export function stripAcaExecBanner(stdout: string): string {
  // eslint-disable-next-line no-control-regex
  const ansi = /\[[0-9;]*m/g;
  return stdout
    .split('\n')
    .map((line) => line.replace(/\r$/, '').replace(ansi, ''))
    // Drop az's connection chatter — emitted both as `INFO: …` and as bare
    // (coloured) lines. psql `-tA` output is plain data rows, none of which
    // start with `INFO:` or carry these phrases.
    .filter(
      (line) =>
        !/^INFO:/.test(line) &&
        !/(Connecting to the container|Successfully Connected|received success status|Use ctrl \+ D to exit|Disconnecting)/i.test(
          line,
        ),
    )
    .join('\n');
}

@Injectable()
export class AcaContainerService extends ContainerService {
  public migrateusAppName: string;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly acaService: AcaService,
  ) {
    super();
    this.migrateusAppName = `migrateus-${customAlphabet('abcdef1234567890')(6)}`;
  }

  public async setup(): Promise<void> {
    const { resourceGroup, environment } = this.acaService.acaEnv;
    throwIfFailed(
      await this.acaService.az(
        // Keep the sidecar alive so `az containerapp exec` has a live replica.
        // Run `sleep infinity` as the entrypoint directly: the previous
        // `--command "/bin/sh" --args "-c,sleep infinity"` reached sh as the
        // single arg `-c,sleep infinity` ("Illegal option -," → CrashLoopBackOff),
        // and az's `--args` rejects a `-c` value (argparse reads the leading dash
        // as an option). `--command "sleep" --args "infinity"` sidesteps both.
        `containerapp create -n ${this.migrateusAppName} -g ${resourceGroup} --environment ${environment} --image ${this.image} --command "sleep" --args "infinity" --min-replicas 1`,
      ),
      (o) => `Failed to create ACA container app with code ${o.code}: ${o.stderr}`,
    );
    await this.waitUntilExecReady();
  }

  /**
   * `containerapp create` returns before the replica's exec endpoint is up, so
   * the first `az containerapp exec` fails with a WebSocket 500
   * (`ClusterExecEndpointWebSocketConnectionError`). Poll a trivial exec until
   * it round-trips a marker, then real commands can run.
   */
  private async waitUntilExecReady(): Promise<void> {
    const marker = `migrateus_ready_${this.migrateusAppName}`;
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { stdout } = await this.execute(`echo ${marker}`);
        if (stdout.includes(marker)) {
          return;
        }
      } catch {
        // not ready yet
      }
      this.logger.debug(
        `Waiting for ${this.migrateusAppName} exec endpoint (attempt ${attempt + 1}/${maxAttempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
      `ACA sidecar ${this.migrateusAppName} never became exec-ready`,
    );
  }

  public async execute(command: string): Promise<ExecOutputReturnValue> {
    // Run the command in the migrateus sidecar via `az containerapp exec`. This
    // mirrors `AcaService.execInDirectus` and must clear the same two hurdles:
    //   1. PTY — `az containerapp exec` is SSH-style and calls
    //      `tty.setcbreak(stdin)`, which throws on a non-TTY stdin. `azExec`
    //      wraps it in `script` to allocate a PTY.
    //   2. argv word-split — `az …exec --command` does NOT use a shell: it
    //      splits the value on whitespace and execs the argv directly. Hiding
    //      every space inside the script as `${IFS}` keeps it as ONE argv word,
    //      so az's split yields exactly `bash -c <script>`; the in-container
    //      bash then re-expands `${IFS}` and runs the real command.
    // The DB drivers escape `$`, `` ` `` and `"` for embedding inside the
    // `bash -c "…"` that docker/k8s build, where the *local* shell strips one
    // quoting layer. Here the script is passed straight to bash (no such layer),
    // so undo that escaping first.
    const script = command
      .replaceAll(/\n/g, ' ')
      .replaceAll('\\$', '$')
      .replaceAll('\\`', '`')
      .replaceAll('\\"', '"')
      .replaceAll(' ', '${IFS}');
    const { resourceGroup } = this.acaService.acaEnv;
    const result = await this.acaService.azExec(
      `containerapp exec -n ${this.migrateusAppName} -g ${resourceGroup} --command ${shquote('bash -c ' + script)}`,
    );
    return { ...result, stdout: stripAcaExecBanner(result.stdout) };
  }

  public execInDirectus(command: string): Promise<ExecOutputReturnValue> {
    return this.acaService.execInDirectus(command);
  }

  public async cleanUp(): Promise<void> {
    const { resourceGroup } = this.acaService.acaEnv;
    await this.acaService.az(
      `containerapp delete -n ${this.migrateusAppName} -g ${resourceGroup} --yes`,
    );
  }

  public async cleanUpAll(): Promise<void> {
    const { resourceGroup } = this.acaService.acaEnv;
    const result = await this.acaService.az(
      `containerapp list -g ${resourceGroup} --query "[?starts_with(name,'migrateus-')].name" -o tsv`,
    );

    const apps = result.stdout
      .split('\n')
      .map((name: string) => name.trim())
      .filter(Boolean);

    for (const app of apps) {
      await this.acaService.az(
        `containerapp delete -n ${app} -g ${resourceGroup} --yes`,
      );
    }
  }

  public async exfilFile(source: string, destination: string): Promise<void> {
    // TODO(verify): large .sqlite via Azure Files share; base64-through-exec is for small payloads only
    const result = throwIfFailed(
      await this.execute(`base64 ${source}`),
      (o) => `Failed to exfil file ${source}: ${o.stderr}`,
    );

    const decoded = Buffer.from(result.stdout.trim(), 'base64');
    await fs.promises.writeFile(destination, decoded);
  }

  public async infilFile(source: string, destination: string): Promise<void> {
    // source is always a controlled CLI-internal path, not user-supplied HTTP input — path traversal risk is acceptable here
    const fileContent = await fs.promises.readFile(source);
    const b64 = fileContent.toString('base64');
    throwIfFailed(
      await this.execute(`echo ${b64} | base64 -d > ${destination}`),
      (o) => `Failed to infil file to ${destination}: ${o.stderr}`,
    );
  }

  public async copyFromDirectus(
    _remotePath: string,
    _localPath: string,
  ): Promise<void> {
    throw new Error(
      'SQLite file access is only supported on docker/docker-compose platforms — use a server engine (PostgreSQL) on k8s/ACA',
    );
  }

  public async copyToDirectus(
    _localPath: string,
    _remotePath: string,
  ): Promise<void> {
    throw new Error(
      'SQLite file access is only supported on docker/docker-compose platforms — use a server engine (PostgreSQL) on k8s/ACA',
    );
  }
}
