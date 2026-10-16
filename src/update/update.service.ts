import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import semver from 'semver';
import chalk from 'chalk';
import { version } from '../version.js';
import { exec, throwIfFailed } from '../util/exec.js';
import confirm from '@inquirer/confirm';

// Migrateus is published on npmjs. Pin the registry: a user's .npmrc may map
// the @neoskop scope elsewhere (e.g. GitHub Packages), where it does not exist.
// `--registry` does not override a scoped entry, so set the scope's registry.
const REGISTRY_FLAG = '--@neoskop:registry=https://registry.npmjs.org';

@Injectable()
export class UpdateService {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) private readonly logger: LoggerService,
  ) {}

  public async checkForUpdates() {
    let latestVersion: Awaited<ReturnType<typeof this.getLatestVersion>>;
    try {
      latestVersion = await this.getLatestVersion();
    } catch (error: any) {
      // The update check is a convenience; it must never block the command.
      this.logger.debug(`Skipping update check: ${error?.message ?? error}`);
      return;
    }

    if (semver.gte(version, latestVersion)) {
      return;
    }

    const answer = await confirm({
      message: `Version ${chalk.red(version)} is outdated. The latest version is ${chalk.green(latestVersion)}. Do you want to update?`,
    });

    if (!answer) {
      return;
    }

    this.logger.debug(
      `Updating from ${chalk.red(version)} to ${chalk.green(latestVersion)}`,
    );

    await exec(
      `npm install -g @neoskop/migrateus@${latestVersion} ${REGISTRY_FLAG}`,
    );

    this.logger.info(
      `Update complete. Please restart the application to use the latest version.`,
    );

    process.exit(0);
  }

  private async getLatestVersion() {
    const { stdout } = throwIfFailed(
      await exec(`npm view @neoskop/migrateus versions --json ${REGISTRY_FLAG}`, {
        silent: true,
      }),
      (o) => o.stderr,
    );

    const versions = JSON.parse(stdout);
    return semver.sort(versions)[versions.length - 1];
  }
}
