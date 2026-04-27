import { Logger } from 'winston';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ContainerService } from '../container/container.service.js';
import chalk from 'chalk';
import { join } from 'node:path';
import fs from 'node:fs';
import tmp from 'tmp';
import { EnvironmentService } from '../environment/environment.service.js';
import { exec } from '../util/exec.js';
import { ProgressService } from '../progress/progress.service.js';
import { DirectusSettingService } from '../directus/directus-setting/directus-setting.service.js';
import { DirectusVersionService } from '../directus/directus-version/directus-version.service.js';
import { fileExists } from '../util/file-exists.js';
import { ConfigService } from '../config/config.service.js';

export abstract class RestorePerformer {
  constructor(
    protected readonly logger: Logger,
    private readonly directusAssetService: DirectusAssetService,
    private readonly directusSettingService: DirectusSettingService,
    private readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
    private readonly environmentService: EnvironmentService,
    private readonly progressService: ProgressService,
    private readonly directusVersionService: DirectusVersionService,
    private readonly configService: ConfigService,
  ) {}

  public async restore(backupFile: string) {
    const backupDir = await this.createTemporaryDirectory();

    try {
      this.progressService.advance('📦 Extract backup archive');
      await this.extractBackupArchive(backupDir, backupFile);
      await this.setup(backupDir);
      this.progressService.advance('🚀 Set-up Migrateus container');
      await this.containerService.setup();
      await this.beforeMysqlDumpRestore();
      const directusPort = await this.getDirectusPort();

      if (!this.configService.force) {
        this.progressService.advance('👤 Set-up Directus user');
        await this.sqlService.setupDirectusUser(this.containerService);
        this.progressService.advance('🔎 Compare Directus versions');
        await this.compareDirectusVersions(directusPort, backupDir);
      }

      this.progressService.advance('🔄 Restore database dump');
      await this.sqlService.restoreMysqlDump(this.containerService);
      this.progressService.advance('👤 Set-up Directus user');
      await this.sqlService.setupDirectusUser(this.containerService);
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
      await this.sqlService.cleanUpDirectusUser(this.containerService);
      await this.cleanUp();
      await this.containerService.cleanUp();
      await this.deleteTemporaryDirectory(backupDir);
      this.progressService.finish();
    }
  }

  private async compareDirectusVersions(
    directusPort: number,
    backupDir: string,
  ) {
    const serverVersion =
      await this.directusVersionService.getVersion(directusPort);

    const metaFilePath = join(backupDir, 'meta.json');

    if (!fileExists(metaFilePath)) {
      return;
    }

    const backupVersion = JSON.parse(
      await fs.promises.readFile(metaFilePath, 'utf8'),
    ).version;

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

  protected async beforeMysqlDumpRestore() {}

  protected abstract getDirectusPort(): Promise<number>;

  protected abstract restartDirectus(): Promise<void>;

  protected async cleanUp(): Promise<void> {}

  private async createTemporaryDirectory() {
    const tempDir = tmp.dirSync({ mode: 0o777, prefix: 'migrateus-' }).name;
    this.logger.debug(`Created temporary directory: ${chalk.bold(tempDir)}`);
    return tempDir;
  }

  private async extractBackupArchive(backupDir: string, backupFile: string) {
    await exec(`tar -xf ${backupFile} -C ${backupDir}`, {
      silent: true,
    });

    const dropTablesSql = `
    DROP PROCEDURE IF EXISTS \`drop_all_tables\`;

    DELIMITER $$
    CREATE PROCEDURE \`drop_all_tables\`()
    BEGIN
        DECLARE _done INT DEFAULT FALSE;
        DECLARE _tableName VARCHAR(255);
        DECLARE _cursor CURSOR FOR
            SELECT table_name
            FROM information_schema.TABLES
            WHERE table_schema = SCHEMA();
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET _done = TRUE;

        SET FOREIGN_KEY_CHECKS = 0;

        OPEN _cursor;

        REPEAT FETCH _cursor INTO _tableName;

        IF NOT _done THEN
            SET @stmt_sql = CONCAT('DROP TABLE \`', _tableName, '\`');
            PREPARE stmt1 FROM @stmt_sql;
            EXECUTE stmt1;
            DEALLOCATE PREPARE stmt1;
        END IF;

        UNTIL _done END REPEAT;

        CLOSE _cursor;
        SET FOREIGN_KEY_CHECKS = 1;
    END$$

    DELIMITER ;

    call drop_all_tables();

    DROP PROCEDURE IF EXISTS \`drop_all_tables\`;
    `;

    const restoreSqlPath = join(backupDir, 'backup.sql');
    const data = await fs.promises.readFile(restoreSqlPath);
    const fd = await fs.promises.open(restoreSqlPath, 'w+');
    const insert = Buffer.from(dropTablesSql);
    await fd.write(insert, 0, insert.length, 0);
    await fd.write(data, 0, data.length, insert.length);
    await fd.close();
  }

  private async deleteTemporaryDirectory(backupDir: string) {
    this.logger.debug(`Deleting temporary directory ${chalk.bold(backupDir)}`);
    await exec('rm -rf ' + backupDir);
  }
}
