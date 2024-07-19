import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import semver from 'semver';
import chalk from 'chalk';
import { version } from '../version.js';
import { exec } from '../util/exec.js';
import confirm from '@inquirer/confirm';

@Injectable()
export class UpdateService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  public async checkForUpdates() {
    const latestVersion = await this.getLatestVersion();

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

    await exec(`npm install -g @neoskop/migrateus@${latestVersion}`);

    this.logger.info(
      `Update complete. Please restart the application to use the latest version.`,
    );

    process.exit(0);
  }

  private async getLatestVersion() {
    const { code, stdout, stderr } = await exec(
      'npm view @neoskop/migrateus versions --json',
      { silent: true },
    );

    if (code !== 0) {
      throw new Error(stderr);
    }

    const versions = JSON.parse(stdout);
    return semver.sort(versions)[versions.length - 1];
  }
}
