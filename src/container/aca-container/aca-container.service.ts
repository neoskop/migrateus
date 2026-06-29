import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import { customAlphabet } from 'nanoid/non-secure';
import { AcaService } from '../../aca/aca.service.js';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { ExecOutputReturnValue } from 'shelljs';
import { throwIfFailed } from '../../util/exec.js';
import { shquote } from '../../util/sh-quote.js';

/** Sentinel that carries the inner command's exit code out of `az exec` (which
 * itself always exits 0 on a successful connection). */
const EXEC_RC_MARKER = '__MIGRATEUS_RC__';

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
    // The PTY emits `\r\r\n` line endings; strip ALL carriage returns (a single
    // leftover `\r` corrupts e.g. UUID parsing) along with ANSI colour codes.
    .map((line) => line.replace(/\r/g, '').replace(ansi, ''))
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

/** Keep the last `max` chars, prefixing a note when anything was dropped. */
function truncateTail(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `…(${text.length - max} chars truncated)…\n${text.slice(-max)}`;
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
    // Run the command in the migrateus sidecar via `az containerapp exec`, which
    // imposes two constraints:
    //   1. PTY — `az containerapp exec` is SSH-style and calls
    //      `tty.setcbreak(stdin)`, which throws on a non-TTY stdin. `azExec`
    //      wraps it in `script` to allocate a PTY.
    //   2. argv word-split — `az …exec --command` does NOT use a shell: it
    //      splits the value on whitespace and execs the argv directly.
    //
    // The `${IFS}`-substitution trick (see execInDirectus) does NOT work here: a
    // `VAR=val command` prefix — e.g. the drivers' `PGPASSWORD=… psql …` — is
    // parsed by bash as ONE assignment word when every space is `${IFS}` (an
    // assignment's RHS is not word-split after expansion), so the command never
    // runs and exits 0 silently. Instead, base64 the real command (real spaces
    // preserved) and decode it into bash via a pipe whose own words ARE plain
    // commands, so the `${IFS}` split is only needed for `echo … | base64 -d |
    // bash`. The drivers escape `$`/`` ` ``/`"` for the `bash -c "…"` that
    // docker/k8s build (one quoting layer the local shell strips); here bash
    // runs the command directly, so undo that escaping first.
    //
    // `az containerapp exec` returns exit 0 as long as it *connected*, even when
    // the inner command failed — so a psql/sqlite error would otherwise pass
    // silently. Append the real exit code as a sentinel and recover it below.
    const payload =
      command
        .replaceAll(/\n/g, ' ')
        .replaceAll('\\$', '$')
        .replaceAll('\\`', '`')
        .replaceAll('\\"', '"') + `; echo ${EXEC_RC_MARKER}$?`;
    const b64 = Buffer.from(payload).toString('base64');
    const script = `echo ${b64} | base64 -d | bash`.replaceAll(' ', '${IFS}');
    const { resourceGroup } = this.acaService.acaEnv;
    const result = await this.acaService.azExec(
      `containerapp exec -n ${this.migrateusAppName} -g ${resourceGroup} --command ${shquote('/bin/sh -c ' + script)}`,
    );

    let stdout = stripAcaExecBanner(result.stdout);
    let code = result.code;
    const match = stdout.match(new RegExp(`${EXEC_RC_MARKER}(\\d+)\\s*$`));
    if (match) {
      code = Number(match[1]);
      stdout = stdout.slice(0, match.index).replace(/\n$/, '');
    }
    // On inner failure the PTY-merged psql/sqlite error sits in stdout — surface
    // it as stderr so throwIfFailed reports something useful, not silence. Cap
    // it: a failed large-output command (e.g. the base64 file exfil) would
    // otherwise flood the log/error with megabytes of payload. Errors land at
    // the tail, so keep the end.
    const stderr =
      code !== 0 && !result.stderr ? truncateTail(stdout, 4000) : result.stderr;
    return { ...result, code, stdout, stderr };
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
    // A real DB dump is multi-MB and this rides the `az containerapp exec`
    // websocket/PTY, which is lossy (the PTY injects spaces mid-stream) and
    // drops the connection past a few MB — a plain `base64 <file>` floods the
    // log and fails. gzip shrinks the payload ~10x so it fits, and its CRC
    // turns any residual corruption into a hard gunzip error instead of a
    // silently-truncated backup. base64 stays shell-inert; Buffer.from ignores
    // the PTY's injected whitespace.
    const result = throwIfFailed(
      await this.execute(`gzip -c ${source} | base64`),
      (o) => `Failed to exfil file ${source}: ${o.stderr}`,
    );

    const decoded = Buffer.from(result.stdout.trim(), 'base64');
    await fs.promises.writeFile(destination, zlib.gunzipSync(decoded));
  }

  public async infilFile(source: string, destination: string): Promise<void> {
    // source is always a controlled CLI-internal path, not user-supplied HTTP input — path traversal risk is acceptable here
    // gzip mirrors exfil so the base64 stays small: the whole command is itself
    // base64'd into ONE argv word for `az containerapp exec`, so an uncompressed
    // multi-MB dump would blow the local ARG_MAX. The sidecar decodes, gunzips.
    // ponytail: gzip pushes the ceiling ~10x, not away — a dump whose gzip+b64
    // still tops ~2MB needs chunked infil. Add that when a restore actually hits it.
    const fileContent = await fs.promises.readFile(source);
    const b64 = zlib.gzipSync(fileContent).toString('base64');
    throwIfFailed(
      await this.execute(`echo ${b64} | base64 -d | gunzip > ${destination}`),
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
