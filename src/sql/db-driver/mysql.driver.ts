import { Logger } from 'winston';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';
import { DatabaseConfig } from '../../backup-db/database-config.interface.js';
import { DbDriver, Exec } from './db-driver.interface.js';
import {
  assertSafeCharsetOrCollation,
  assertSafeIdentifier,
  escapeMysqlIdentifier,
  escapeMysqlString,
} from '../sql-escape.js';
import { DEFAULT_CONTAINER_IMAGE } from '../../container/container.constants.js';

export class MysqlDriver implements DbDriver {
  public readonly client = 'mysql' as const;
  public readonly clientImage = DEFAULT_CONTAINER_IMAGE;
  public readonly usesSidecar = true;

  constructor(
    private readonly config: DatabaseConfig,
    private readonly logger: Logger,
  ) {}

  public escapeString(value: string): string {
    return escapeMysqlString(value);
  }
  public escapeIdentifier(identifier: string): string {
    return escapeMysqlIdentifier(identifier);
  }
  public assertSafeIdentifier(identifier: string, context: string): string {
    return assertSafeIdentifier(identifier, context);
  }
  public boolLiteral(value: boolean): string {
    return value ? '1' : '0';
  }
  public deleteOne(table: string, where: string): string {
    return `DELETE FROM ${table} WHERE ${where} LIMIT 1`;
  }
  public disableFks(): string {
    return 'SET foreign_key_checks = 0';
  }
  public enableFks(): string {
    return 'SET foreign_key_checks = 1';
  }

  public async dump(exec: Exec, artifact: string, tableNames?: string[]): Promise<void> {
    const { host, port, user, password, name } = this.config;
    const command = [
      'mysqldump',
      '--set-gtid-purged=OFF',
      '--no-tablespaces',
      '--skip-lock-tables',
      '--skip-add-locks',
      '--compatible=ansi',
      '--default-character-set=utf8mb4',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      tableNames && tableNames.join(' '),
      `>${artifact}`,
    ]
      .filter(Boolean)
      .join(' ');

    const output = await exec(command);
    if (output.code !== 0) {
      throw new Error(`Backup failed with status code ${output.code}: ${output.stderr}`);
    }
  }

  public async restore(exec: Exec, artifact: string): Promise<void> {
    const { host, port, user, password, name } = this.config;
    const command = [
      'mysql',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      '--default-character-set=utf8mb4',
      name,
      `<${artifact}`,
    ].join(' ');

    const output = await exec(command);
    if (output.code !== 0) {
      throw new Error(`Restore failed with status code ${output.code}: ${output.stderr}`);
    }
  }

  public async postRestoreFixups(exec: Exec): Promise<void> {
    const { name } = this.config;
    const escapedName = escapeMysqlString(name);

    const defaultCollation = assertSafeCharsetOrCollation(
      (await this.executeSql(
        exec,
        `SELECT DEFAULT_COLLATION_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=${escapedName};`,
      ))
        .split('\n')
        .join(' ')
        .trim(),
      'default collation',
    );

    const defaultCharacterSetName = assertSafeCharsetOrCollation(
      (await this.executeSql(
        exec,
        `SELECT default_character_set_name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=${escapedName};`,
      ))
        .split('\n')
        .join(' ')
        .trim(),
      'default character set',
    );

    this.logger.debug(`Setting default collation to ${chalk.bold(defaultCollation)}`);

    const tableNames = (await this.executeSql(
      exec,
      `SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=${escapedName} AND TABLE_TYPE='BASE TABLE'`,
    ))
      .split('\n')
      .filter(Boolean)
      .map((t) => assertSafeIdentifier(t, 'table_name'));

    const alterStatements = tableNames.map(
      (t) =>
        'ALTER TABLE ' +
        escapeMysqlIdentifier(t) +
        ' CONVERT TO CHARACTER SET ' +
        defaultCharacterSetName +
        ' COLLATE ' +
        defaultCollation,
    );

    await this.executeSql(
      exec,
      this.disableFks() + '; ' + alterStatements.join(';') + '; ' + this.enableFks(),
    );
  }

  public async listTables(exec: Exec): Promise<string[]> {
    const escapedName = escapeMysqlString(this.config.name);
    return (await this.executeSql(
      exec,
      `SELECT table_name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=${escapedName} AND TABLE_TYPE='BASE TABLE';`,
    ))
      .split('\n')
      .filter(Boolean);
  }

  public async dropAllTables(exec: Exec): Promise<void> {
    const tables = await this.listTables(exec);
    if (tables.length === 0) {
      return;
    }
    const escapedTables = tables
      .map((t) => escapeMysqlIdentifier(assertSafeIdentifier(t, 'table_name')))
      .join(', ');
    await this.executeSql(
      exec,
      `SET foreign_key_checks = 0; DROP TABLE IF EXISTS ${escapedTables}; SET foreign_key_checks = 1`,
    );
  }

  public async executeSql(exec: Exec, sql: string): Promise<string> {
    const { host, port, user, password, name } = this.config;
    const command = [
      'mysql',
      '-sN',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      '-e',
      `\\"${sql.replaceAll(/[$`]/g, '\\\\\\$&')}\\"`,
    ];
    this.logger.debug(
      `Executing SQL: ${highlight(sql, { language: 'sql', ignoreIllegals: true })}`,
    );
    const output = await exec(command.join(' '));
    if (output.code !== 0) {
      throw new Error(
        `Execution of SQL failed with status code ${output.code}: ${output.stderr}`,
      );
    }
    return output.stdout;
  }
}
