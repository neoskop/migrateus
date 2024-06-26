import { Logger } from 'winston';
import { Environment } from '../config/environment.interface.js';
import shell from 'shelljs';
import { highlight } from 'sql-highlight';
import { DatabaseConfig } from './database-config.interface.js';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';

export abstract class BackupPerformer<T extends Environment> {
  private databaseConfig: DatabaseConfig;

  constructor(
    protected readonly logger: Logger,
    private readonly directusUserService: DirectusUserService,
    private readonly directusAssetService: DirectusAssetService,
  ) {}

  public async backup(environment: T, backupFile: string) {
    const backupDir = this.createTemporaryDirectory();

    try {
      await this.setup(environment, backupDir);
      this.databaseConfig = this.getDatabaseConfig();
      await this.setupDirectusUser();
      this.performMysqlDump();
      await this.directusAssetService.backupAssets(backupDir);
      this.createBackupArchive(backupDir, backupFile);
    } catch (error) {
      this.logger.error(error);
    } finally {
      await this.cleanUpDirectusUser();
      await this.cleanUp();
      this.deleteTemporaryDirectory(backupDir);
    }
  }

  protected abstract setup(environment: T, backupDir: string): Promise<void>;

  protected abstract cleanUp(): Promise<void>;

  protected abstract executeInMigrateusContainer(
    command: string,
  ): shell.ExecOutputReturnValue;

  protected abstract getDatabaseConfig(): DatabaseConfig;

  protected exceuteSql(sql: string) {
    const { host, port, user, password, name } = this.databaseConfig;
    const command = [
      'mysql',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      '-e',
      `\\"${sql}\\"`,
    ];
    this.logger.debug(`Executing SQL: ${highlight(sql)}`);
    const output = this.executeInMigrateusContainer(command.join(' '));

    if (output.code !== 0) {
      throw new Error(output.stderr);
    }
  }

  protected performMysqlDump() {
    const { host, port, user, password, name } = this.databaseConfig;
    const command = [
      'mysqldump',
      '--no-tablespaces',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      '>/backup/backup.sql',
    ].join(' ');

    const output = this.executeInMigrateusContainer(command);

    if (output.code !== 0) {
      throw new Error(`Backup failed: ${output.stderr}`);
    }
  }

  private async setupDirectusUser() {
    await this.directusUserService.setupUser((sql) =>
      this.exceuteSql.bind(this)(sql, this.databaseConfig),
    );
  }

  private async cleanUpDirectusUser() {
    await this.directusUserService.removeUser((sql) =>
      this.exceuteSql.bind(this)(sql, this.databaseConfig),
    );
  }

  private createTemporaryDirectory() {
    return shell
      .exec('mktemp -d --suffix=-migrateus', { silent: true })
      .stdout.trim();
  }

  private createBackupArchive(backupDir: string, backupFile: string) {
    shell.exec(`tar -czf ${backupFile} ${backupDir}/*`, {
      silent: true,
    });
  }

  private deleteTemporaryDirectory(backupDir: string) {
    shell.rm('-rf', backupDir);
  }
}
