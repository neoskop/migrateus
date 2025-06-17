import { Inject, Injectable } from '@nestjs/common';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';
import { highlight } from 'cli-highlight';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { ContainerService } from '../container/container.service.js';
import chalk from 'chalk';
import { Credential } from '../directus/directus-user/credential.type.js';
import { RedactService } from '../redact/redact.service.js';

@Injectable()
export class SqlService {
  private _databaseConfig: DatabaseConfig;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly directusUserService: DirectusUserService,
    private readonly redactService: RedactService,
  ) {}

  public set databaseConfig(config: DatabaseConfig) {
    this.redactService.addRedaction(`-p${config.password}`, { prefix: '-p' });
    this.redactService.addRedaction(config.password);
    this.logger.debug(
      `Database config: ${highlight(JSON.stringify(config), { language: 'json' })}`,
    );
    this._databaseConfig = config;
  }

  public async setupDirectusUser(containerService: ContainerService) {
    await this.directusUserService.setupUser((sql) =>
      this.exceuteSql.bind(this)(sql, containerService),
    );
  }

  public async cleanUpDirectusUser(containerService: ContainerService) {
    await this.directusUserService.removeUser((sql) =>
      this.exceuteSql.bind(this)(sql, containerService),
    );
  }

  public async cleanUpAllDirectusUsers(containerService: ContainerService) {
    await this.directusUserService.cleanUp((sql) =>
      this.exceuteSql.bind(this)(sql, containerService),
    );
  }

  public async setCredentials(
    credentials: Credential[],
    containerService: ContainerService,
  ) {
    if (!credentials || credentials.length === 0) {
      return;
    }

    await this.directusUserService.setCredentials(credentials, (sql) =>
      this.exceuteSql.bind(this)(sql, containerService),
    );
  }

  public async performMysqlDump(
    containerService: ContainerService,
    tableNames?: string[],
  ) {
    const { host, port, user, password, name } = this._databaseConfig;
    const command = [
      'mysqldump',
      '--set-gtid-purged=OFF',
      '--no-tablespaces',
      '--skip-lock-tables',
      '--skip-add-locks',
      '--compatible=ansi',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      tableNames && tableNames.join(' '),
      '>/tmp/backup.sql',
    ]
      .filter(Boolean)
      .join(' ');

    const output = await containerService.execute(command);

    if (output.code !== 0) {
      throw new Error(
        `Backup failed with status code ${output.code}: ${output.stderr}`,
      );
    }
  }

  public async restoreMysqlDump(containerService: ContainerService) {
    const { host, port, user, password, name } = this._databaseConfig;
    const command = [
      'mysql',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      '</tmp/backup.sql',
    ].join(' ');

    const output = await containerService.execute(command);

    if (output.code !== 0) {
      const errorMessage = `Restore failed with status code ${output.code}: ${output.stderr}`;
      throw new Error(errorMessage);
    }

    const defaultCollation = (
      await this.exceuteSql(
        `SELECT DEFAULT_COLLATION_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='${name}';`,
        containerService,
      )
    )
      .split('\n')
      .slice(1)
      .join(' ');

    const defaultCharacterSetName = (
      await this.exceuteSql(
        `SELECT default_character_set_name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='${name}';`,
        containerService,
      )
    )
      .split('\n')
      .slice(1)
      .join(' ');

    this.logger.debug(
      `Setting default collation to ${chalk.bold(defaultCollation)}`,
    );
    const tableNames = (
      await this.exceuteSql(
        `SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${name}' AND TABLE_TYPE='BASE TABLE'`,
        containerService,
      )
    )
      .split('\n')
      .slice(1)
      .filter(Boolean);

    const alterStatements = tableNames.map((tableName) => {
      return (
        'ALTER TABLE \\\\\\`' +
        tableName +
        '\\\\\\` CONVERT TO CHARACTER SET ' +
        defaultCharacterSetName +
        ' COLLATE ' +
        defaultCollation
      );
    });

    await this.exceuteSql(
      'SET foreign_key_checks = 0; ' +
        alterStatements.join(';') +
        '; SET foreign_key_checks = 1',
      containerService,
    );
  }

  public async listTables(containerService: ContainerService) {
    return (
      await this.exceuteSql(
        `SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${this._databaseConfig.name}' AND TABLE_TYPE='BASE TABLE';`,
        containerService,
      )
    )
      .split('\n')
      .filter(Boolean)
      .slice(1);
  }

  private async exceuteSql(sql: string, containerService: ContainerService) {
    const { host, port, user, password, name } = this._databaseConfig;
    const command = [
      'mysql',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      '-e',
      `\\"${sql.replaceAll(/\$/g, '\\\\\\$')}\\"`,
    ];
    this.logger.debug(
      `Executing SQL: ${highlight(sql, { language: 'sql', ignoreIllegals: true })}`,
    );
    const output = await containerService.execute(command.join(' '));

    if (output.code !== 0) {
      throw new Error(
        `Execution of SQL failed with status code ${output.code}: ${output.stderr}`,
      );
    }

    return output.stdout;
  }
}
