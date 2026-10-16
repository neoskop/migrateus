import { LoggerService } from '../logger/logger.service.js';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ContainerService } from '../container/container.service.js';
import chalk from 'chalk';
import { join } from 'node:path';
import fs from 'node:fs';
import {
  createWorkDir,
  removeWorkDir,
  extractArchive,
} from '../util/backup-archive.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { DirectusSettingService } from '../directus/directus-setting/directus-setting.service.js';
import { DirectusVersionService } from '../directus/directus-version/directus-version.service.js';
import { fileExists } from '../util/file-exists.js';
import { ConfigService } from '../config/config.service.js';
import {
  newSalt,
  pseudonymizeDatabase,
  rulesForRestore,
} from '../pseudonymize/pseudonymize.js';

export abstract class RestorePerformer {
  constructor(
    protected readonly logger: LoggerService,
    private readonly directusAssetService: DirectusAssetService,
    private readonly directusSettingService: DirectusSettingService,
    protected readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
    private readonly environmentService: EnvironmentService,
    private readonly progressService: ProgressService,
    private readonly directusVersionService: DirectusVersionService,
    private readonly configService: ConfigService,
  ) {}

  public async restore(backupFile: string) {
    const backupDir = createWorkDir(0o777);

    // Extract + platform setup populate the database config (and thus the
    // driver) — they MUST run before branching on `usesSidecar`.
    try {
      this.progressService.advance('📦 Extract backup archive');
      await extractArchive(backupFile, backupDir);
      await this.setup(backupDir);
    } catch (error: any) {
      this.progressService.fail(error);
      await removeWorkDir(backupDir);
      this.progressService.finish();
      return;
    }

    if (this.sqlService.usesSidecar) {
      await this.restoreServerFlow(backupDir, backupFile);
    } else {
      await this.restoreFileFlow(backupDir, backupFile);
    }
  }

  private async restoreServerFlow(backupDir: string, backupFile: string) {
    let isDirectusStopped = false;
    try {
      // NOTE: cross-engine (pgloader) restore needs an image bundling psql+pgloader; the per-driver clientImage selects the native CLI image. A bundled tools image must be supplied via --image for the pgloader path (UNVERIFIED).
      this.containerService.image = this.sqlService.clientImage;
      this.progressService.advance('🚀 Set-up Migrateus container');
      await this.containerService.setup();
      await this.beforeMysqlDumpRestore();
      let directusPort = await this.getDirectusPort();

      const manifest = await this.readManifest(backupDir);

      if (!this.configService.force) {
        this.progressService.advance('👤 Set-up Directus user');
        await this.sqlService.setupDirectusUser(
          this.containerService,
          directusPort,
        );
        this.progressService.advance('🔎 Compare Directus versions');
        await this.compareDirectusVersions(directusPort, manifest.version);
      }

      // A running Directus writes to the tables being replaced (deadlocks on
      // Galera clusters) and replays migrations against a half-restored
      // schema when its pod restarts, so it stays down until the data is in.
      this.progressService.advance('⏸️ Stopping Directus');
      isDirectusStopped = true;
      await this.stopDirectus();

      this.progressService.advance('🧨 Dropping existing tables');
      await this.sqlService.dropAllTables(this.containerService);
      this.progressService.advance('🔄 Restore database dump');
      // Use the correct in-sidecar artifact path based on the source client:
      // sqlite3 sources use database.sqlite; all server sources use backup.sql.
      // TODO: infil database.sqlite for k8s/aca sqlite→pg (that cross-engine combo is an unverified edge).
      const artifactName =
        manifest.client === 'sqlite3' ? 'database.sqlite' : 'backup.sql';
      await this.sqlService.transferRestore(
        this.containerService,
        manifest.client,
        `/tmp/${artifactName}`,
      );
      await this.pseudonymize(manifest.pseudonymized);
      this.progressService.advance('▶️ Starting Directus');
      directusPort = await this.startDirectus(directusPort);
      isDirectusStopped = false;
      this.progressService.advance('👤 Set-up Directus user');
      await this.sqlService.setupDirectusUser(
        this.containerService,
        directusPort,
      );
      await this.sqlService.setCredentials(
        this.environmentService.environment.credentials,
        this.containerService,
      );

      if (this.environmentService.environment.assetStorage) {
        this.progressService.advance('🗂️ Remapping asset storage');
        await this.sqlService.setAssetStorage(
          this.environmentService.environment.assetStorage,
          this.containerService,
        );
      }

      this.progressService.advance('🖼️ Restoring assets');
      const failedUploads = await this.directusAssetService.restoreAssets(
        directusPort,
        backupDir,
        this.progressService.updateText.bind(this.progressService),
      );

      if (failedUploads > 0) {
        this.progressService.warn(
          `Failed to upload ${chalk.bold(failedUploads)} assets.`,
        );
      }

      if (this.environmentService.environment.settings) {
        this.progressService.advance('🔧 Updating project settings');
        await this.directusSettingService.updateSettings(
          directusPort,
          this.environmentService.environment.settings,
        );
      }

      this.progressService.advance('🔄 Restarting Directus');
      await this.restartDirectus();
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🛁 Clean-up');
      if (isDirectusStopped) {
        await this.startDirectus(0).catch((error: any) =>
          this.logger.error(
            `Failed to start Directus again: ${error?.message ?? error}`,
          ),
        );
      }
      await this.sqlService.cleanUpDirectusUser();
      await this.cleanUp();
      await this.containerService.cleanUp();
      await removeWorkDir(backupDir);
      this.progressService.finish();
    }
  }

  private async restoreFileFlow(backupDir: string, backupFile: string) {
    try {
      this.progressService.advance('💾 Copy database file');
      await this.copyDatabaseIn(backupDir);
      await this.pseudonymize(
        (await this.readManifest(backupDir)).pseudonymized,
      );

      this.progressService.advance('🔄 Restarting Directus');
      await this.restartDirectus();
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🛁 Clean-up');
      await this.cleanUp();
      await removeWorkDir(backupDir);
      this.progressService.finish();
    }
  }

  private async readManifest(backupDir: string): Promise<{
    version?: string;
    client: 'mysql' | 'pg' | 'sqlite3';
    format: 'physical' | 'logical';
    pseudonymized: boolean;
  }> {
    const metaFilePath = join(backupDir, 'meta.json');
    if (!(await fileExists(metaFilePath))) {
      return {
        format: 'physical',
        client: this.sqlService.client,
        pseudonymized: false,
      };
    }
    const parsed = JSON.parse(await fs.promises.readFile(metaFilePath, 'utf8'));
    return {
      version: parsed.version,
      client: parsed.client ?? this.sqlService.client,
      format: parsed.format ?? 'physical',
      pseudonymized: parsed.pseudonymized === true,
    };
  }

  /** Overwrites configured fields in the restored database (opt-in per environment). */
  private async pseudonymize(archivePseudonymized: boolean) {
    const rules = rulesForRestore(
      this.environmentService.environment,
      this.configService.getPseudonymizeRules(),
      archivePseudonymized,
    );
    if (!rules) {
      return;
    }
    this.progressService.advance('🎭 Pseudonymizing personal data');
    this.progressService.warn(
      'Physical backups are pseudonymized after the dump is restored, so real personal data was briefly present in the target database.',
    );
    await pseudonymizeDatabase(
      {
        executeSql: (sql) =>
          this.sqlService.executeSql(sql, this.containerService),
        escapeIdentifier: (id) => this.sqlService.escapeIdentifier(id),
        escapeString: (value) => this.sqlService.escapeString(value),
      },
      rules,
      newSalt(),
      this.configService.getCredentialEmails(),
    );
  }

  private async compareDirectusVersions(
    directusPort: number,
    backupVersion: string | undefined,
  ) {
    const serverVersion =
      await this.directusVersionService.getVersion(directusPort);

    if (backupVersion === undefined) {
      return;
    }

    if (
      this.directusVersionService.isDangerousMismatch(
        serverVersion,
        backupVersion,
      )
    ) {
      throw new Error(
        `Backup version ${chalk.bold(backupVersion)} does not match server version ${chalk.bold(serverVersion)}`,
      );
    }
  }

  protected abstract setup(backupDir: string): Promise<void>;

  protected beforeMysqlDumpRestore(): Promise<void> {
    return Promise.resolve();
  }

  protected abstract getDirectusPort(): Promise<number>;

  protected abstract restartDirectus(): Promise<void>;

  /** Stops Directus while the dump is restored. Only k8s implements it so far. */
  protected stopDirectus(): Promise<void> {
    return Promise.resolve();
  }

  /** Starts Directus after stopDirectus and returns the (possibly new) Directus port. */
  protected startDirectus(directusPort: number): Promise<number> {
    return Promise.resolve(directusPort);
  }

  protected cleanUp(): Promise<void> {
    return Promise.resolve();
  }

  /** File-based (SQLite) platforms implement this to copy the DB file and uploads into the Directus container. */
  protected copyDatabaseIn(_backupDir: string): Promise<void> {
    throw new Error('copyDatabaseIn is not implemented for this platform');
  }
}
