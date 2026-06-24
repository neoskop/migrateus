import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
// NOTE: az command shapes are UNVERIFIED against a live Azure subscription.

import { Inject, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service.js';
import { AcaEnvironment } from '../config/environment.interface.js';
import { SqlService } from '../sql/sql.service.js';
import { exec, throwIfFailed } from '../util/exec.js';
import { shquote } from '../util/sh-quote.js';
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
    return exec(`script -qec ${shquote(this.azCommand(args))} /dev/null`, opts);
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

    const envMap: Record<string, string> = {};
    for (const entry of envArray) {
      if (entry.secretRef !== undefined) {
        this.logger.debug(
          `ACA env var ${entry.name} is a secretRef and cannot be read directly; using empty string`,
        );
        envMap[entry.name] = '';
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
