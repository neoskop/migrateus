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
    protected readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
    private readonly config: ConfigService,
    private readonly progressService: ProgressService,
    private readonly directusVersionService: DirectusVersionService,
  ) { }

  public async backup(backupFile: string) {
    const backupDir = await this.createTemporaryDirectory();

    if (this.sqlService.usesSidecar) {
      await this.backupServerFlow(backupDir, backupFile);
    } else {
      await this.backupFileFlow(backupDir, backupFile);
    }
  }

  private async backupServerFlow(backupDir: string, backupFile: string) {
    try {
      await this.setup(backupDir);
      // NOTE: cross-engine (pgloader) restore needs an image bundling psql+pgloader; the per-driver clientImage selects the native CLI image. A bundled tools image must be supplied via --image for the pgloader path (UNVERIFIED).
      this.containerService.image = this.sqlService.clientImage;
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
    } catch (error: any) {
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

  private async backupFileFlow(backupDir: string, backupFile: string) {
    try {
      await this.setup(backupDir);

      this.progressService.advance('💾 Copy database file');
      await this.copyDatabaseOut(backupDir);

      this.progressService.advance('🏷️ Save backup metadata');
      await this.storeFileMetadata(backupDir);
      this.progressService.advance('📦 Create backup archive');
      const size = await this.createBackupArchive(backupDir, backupFile);
      this.progressService.succeed(`Archive is ${chalk.bold(size)} in size`);
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🛁 Clean-up');
      await this.cleanUp();
      await this.deleteTemporaryDirectory(backupDir);
      this.progressService.finish();
    }
  }

  protected abstract setup(backupDir: string): Promise<void>;

  protected afterMysqlDump(): Promise<void> {
    return Promise.resolve();
  }

  protected abstract getDirectusPort(): Promise<number>;

  protected cleanUp(): Promise<void> {
    return Promise.resolve();
  }

  /** File-based (SQLite) platforms implement this to copy the DB file and uploads out of the Directus container. */
  protected copyDatabaseOut(_backupDir: string): Promise<void> {
    throw new Error('copyDatabaseOut is not implemented for this platform');
  }

  /**
   * Returns the Directus version string parsed from the container image tag when available.
   * Subclasses on platforms that have container metadata override this.
   * Default: undefined (version omitted from file-based meta.json on platforms without it).
   */
  protected getDirectusVersionHint(): string | undefined {
    return undefined;
  }

  private async storeMetadata(directusPort: number, backupDir: string) {
    const version = await this.directusVersionService.getVersion(directusPort);
    const client = this.sqlService.client;
    await fs.promises.writeFile(
      join(backupDir, 'meta.json'),
      JSON.stringify({ version, client, timestamp: new Date().toISOString() }, null, 2),
    );
  }

  private async storeFileMetadata(backupDir: string) {
    const client = this.sqlService.client;
    const dbFilename = this.sqlService.databaseFilename;
    const version = this.getDirectusVersionHint();
    await fs.promises.writeFile(
      join(backupDir, 'meta.json'),
      JSON.stringify({ version, client, dbFilename, timestamp: new Date().toISOString() }, null, 2),
    );
  }

  private createTemporaryDirectory() {
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
