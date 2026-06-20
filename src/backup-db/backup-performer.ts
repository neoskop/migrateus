import { LoggerService } from '../logger/logger.service.js';
import {
  createWorkDir,
  removeWorkDir,
  createArchive,
} from '../util/backup-archive.js';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ContainerService } from '../container/container.service.js';
import { join } from 'node:path';
import chalk from 'chalk';
import { ConfigService } from '../config/config.service.js';
import { ProgressService } from '../progress/progress.service.js';
import fs from 'node:fs';
import { DirectusVersionService } from '../directus/directus-version/directus-version.service.js';

export abstract class BackupPerformer {
  constructor(
    protected readonly logger: LoggerService,
    private readonly directusAssetService: DirectusAssetService,
    protected readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
    private readonly config: ConfigService,
    private readonly progressService: ProgressService,
    private readonly directusVersionService: DirectusVersionService,
  ) {}

  public async backup(backupFile: string) {
    const backupDir = createWorkDir(0o777);

    // Platform setup populates the database config (and thus the driver) — it
    // MUST run before branching on `usesSidecar`, which reads the driver.
    try {
      await this.setup(backupDir);
    } catch (error: any) {
      this.progressService.fail(error);
      await removeWorkDir(backupDir);
      this.progressService.finish();
      return;
    }

    if (this.sqlService.usesSidecar) {
      await this.backupServerFlow(backupDir, backupFile);
    } else {
      await this.backupFileFlow(backupDir, backupFile);
    }
  }

  private async backupServerFlow(backupDir: string, backupFile: string) {
    try {
      // NOTE: cross-engine (pgloader) restore needs an image bundling psql+pgloader; the per-driver clientImage selects the native CLI image. A bundled tools image must be supplied via --image for the pgloader path (UNVERIFIED).
      this.containerService.image = this.sqlService.clientImage;
      this.progressService.advance('🚀 Set-up Migrateus container');
      await this.containerService.setup();
      this.progressService.advance('💾 Dump database');
      await this.sqlService.performMysqlDump(this.containerService);
      await this.afterMysqlDump();

      this.progressService.advance('👤 Set-up Directus user');
      const directusPort = await this.getDirectusPort();
      await this.sqlService.setupDirectusUser(
        this.containerService,
        directusPort,
      );

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
      const size = await createArchive(backupDir, backupFile);
      this.progressService.succeed(`Archive is ${chalk.bold(size)} in size`);
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🛁 Clean-up');
      if (!this.config.noAssets) {
        await this.sqlService.cleanUpDirectusUser();
      }
      await this.containerService.cleanUp();
      await this.cleanUp();
      await removeWorkDir(backupDir);
      this.progressService.finish();
    }
  }

  private async backupFileFlow(backupDir: string, backupFile: string) {
    try {
      this.progressService.advance('💾 Copy database file');
      await this.copyDatabaseOut(backupDir);

      this.progressService.advance('🏷️ Save backup metadata');
      await this.storeFileMetadata(backupDir);
      this.progressService.advance('📦 Create backup archive');
      const size = await createArchive(backupDir, backupFile);
      this.progressService.succeed(`Archive is ${chalk.bold(size)} in size`);
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🛁 Clean-up');
      await this.cleanUp();
      await removeWorkDir(backupDir);
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
      JSON.stringify(
        { version, client, format: 'physical', timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
  }

  private async storeFileMetadata(backupDir: string) {
    const client = this.sqlService.client;
    const dbFilename = this.sqlService.databaseFilename;
    const version = this.getDirectusVersionHint();
    await fs.promises.writeFile(
      join(backupDir, 'meta.json'),
      JSON.stringify(
        { version, client, dbFilename, format: 'physical', timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
  }

}
