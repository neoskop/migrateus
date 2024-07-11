import { Logger } from 'winston';
import shell from 'shelljs';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ContainerService } from '../container/container.service.js';
import chalk from 'chalk';
import { join } from 'node:path';
import fs from 'node:fs';
import tmp from 'tmp';
import { EnvironmentService } from '../environment/environment.service.js';

export abstract class RestorePerformer {
  constructor(
    protected readonly logger: Logger,
    private readonly directusAssetService: DirectusAssetService,
    private readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
    private readonly environmentService: EnvironmentService,
  ) {}

  public async restore(backupFile: string) {
    const backupDir = await this.createTemporaryDirectory();

    try {
      await this.extractBackupArchive(backupDir, backupFile);
      await this.setup(backupDir);
      this.containerService.setup();
      await this.beforeMysqlDumpRestore();
      await this.sqlService.restoreMysqlDump(this.containerService);
      await this.sqlService.setupDirectusUser(this.containerService);
      await this.sqlService.setCredentials(
        this.environmentService.environment.credentials,
        this.containerService,
      );
      const directusPort = await this.getDirectusPort();
      await this.directusAssetService.restoreAssets(directusPort, backupDir);
    } catch (error) {
      this.logger.error(error.message || error);
    } finally {
      this.logger.info('Cleaning up');
      await this.sqlService.cleanUpDirectusUser(this.containerService);
      await this.cleanUp();
      this.containerService.cleanUp();
      this.deleteTemporaryDirectory(backupDir);
    }
  }

  protected abstract setup(backupDir: string): Promise<void>;

  protected async beforeMysqlDumpRestore() {}

  protected abstract getDirectusPort(): Promise<number>;

  protected async cleanUp(): Promise<void> {}

  private async createTemporaryDirectory() {
    const tempDir = tmp.dirSync({ mode: 0o777, prefix: 'migrateus-' }).name;
    this.logger.debug(`Created temporary directory: ${chalk.bold(tempDir)}`);
    return tempDir;
  }

  private async extractBackupArchive(backupDir: string, backupFile: string) {
    shell.exec(`tar -xf ${backupFile} -C ${backupDir}`, {
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

  private deleteTemporaryDirectory(backupDir: string) {
    this.logger.debug(`Deleting temporary directory ${chalk.bold(backupDir)}`);
    shell.rm('-rf', backupDir);
  }
}
