import { Logger } from 'winston';
import shell from 'shelljs';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ContainerService } from '../container/container.service.js';
import { join } from 'node:path';
import chalk from 'chalk';
import { ConfigService } from '../config/config.service.js';
import tmp from 'tmp';
import { exec } from '../util/exec.js';
import { ProgressService } from '../progress/progress.service.js';
import fs from 'node:fs';
import prettyBytes from 'pretty-bytes';
import { DirectusVersionService } from '../directus/directus-version/directus-version.service.js';

export abstract class BackupPerformer {
  constructor(
    protected readonly logger: Logger,
    private readonly directusAssetService: DirectusAssetService,
    private readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
    private readonly config: ConfigService,
    private readonly progressService: ProgressService,
    private readonly directusVersionService: DirectusVersionService,
  ) {}

  public async backup(backupFile: string) {
    const backupDir = await this.createTemporaryDirectory();

    try {
      await this.setup(backupDir);
      this.progressService.advance('🚀 Set-up Migrateus container');
      await this.containerService.setup();
      this.progressService.advance('💾 Dump database');
      await this.sqlService.performMysqlDump(this.containerService);
      await this.afterMysqlDump();

      this.progressService.advance('👤 Set-up Directus user');
      await this.sqlService.setupDirectusUser(this.containerService);
      const directusPort = await this.getDirectusPort();

      if (this.config.noAssets) {
        this.logger.debug('Skipping backup of assets');
      } else {
        this.progressService.advance('🖼️ Downloading assets');
        const failedDownloads = await this.directusAssetService.backupAssets(
          directusPort,
          backupDir,
          this.progressService.updateText.bind(this.progressService),
        );

        if (failedDownloads.length > 0) {
          this.progressService.warn(
            `Failed to download ${chalk.bold(failedDownloads.length)} assets`,
          );

          for (const asset of failedDownloads) {
            this.logger.debug(
              `Failed to download asset ${chalk.bold(asset.id)}: ${chalk.bold(asset.filename_disk)}`,
            );
          }
        }
      }

      this.progressService.advance('🏷️ Save backup metadata');
      await this.storeMetadata(directusPort, backupDir);
      this.progressService.advance('📦 Create backup archive');
      const size = await this.createBackupArchive(backupDir, backupFile);
      this.progressService.succeed(`Archive is ${chalk.bold(size)} in size`);
    } catch (error) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🛁 Clean-up');
      if (!this.config.noAssets) {
        await this.sqlService.cleanUpDirectusUser(this.containerService);
      }
      await this.containerService.cleanUp();
      await this.cleanUp();
      await this.deleteTemporaryDirectory(backupDir);
      this.progressService.finish();
    }
  }

  protected abstract setup(backupDir: string): Promise<void>;

  protected async afterMysqlDump() {}

  protected abstract getDirectusPort(): Promise<number>;

  protected async cleanUp(): Promise<void> {}

  private async storeMetadata(directusPort: number, backupDir: string) {
    const version = await this.directusVersionService.getVersion(directusPort);
    await fs.promises.writeFile(
      join(backupDir, 'meta.json'),
      JSON.stringify({ version, timestamp: new Date().toISOString() }, null, 2),
    );
  }

  private async createTemporaryDirectory() {
    const tempDir = tmp.dirSync({ mode: 0o777, prefix: 'migrateus-' }).name;
    this.logger.debug(`Created temporary directory: ${chalk.bold(tempDir)}`);
    return tempDir;
  }

  private async createBackupArchive(backupDir: string, backupFile: string) {
    const targetPath = join(shell.pwd().stdout, backupFile);
    const ouput = await exec(`tar -czf ${targetPath} *`, {
      silent: true,
      cwd: backupDir,
    });

    if (ouput.code !== 0) {
      throw new Error(
        `Failed to create backup archive ${chalk.bold(targetPath)}: ${chalk.red(ouput.stderr)}`,
      );
    }

    const { size } = await fs.promises.stat(targetPath);
    const prettySize = prettyBytes(size);
    return prettySize;
  }

  private async deleteTemporaryDirectory(backupDir: string) {
    this.logger.debug(`Removing temporary directory ${chalk.bold(backupDir)}`);
    await exec(`rm -rf ${backupDir}`, { silent: true });
  }
}
