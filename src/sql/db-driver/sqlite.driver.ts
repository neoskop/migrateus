import { Logger } from 'winston';
import { DatabaseConfig } from '../../backup-db/database-config.interface.js';
import { DbDriver, Exec } from './db-driver.interface.js';
import {
  assertSafeIdentifier,
  escapeAnsiIdentifier,
  escapeAnsiString,
} from '../sql-escape.js';

export class SqliteDriver implements DbDriver {
  public readonly client = 'sqlite3' as const;
  public readonly clientImage = 'keinos/sqlite3:latest';

  constructor(
    private readonly config: DatabaseConfig,
    private readonly logger: Logger,
  ) {}

  private file(): string {
    return this.config.filename ?? this.config.name;
  }

  public escapeString(value: string): string {
    return escapeAnsiString(value);
  }

  public escapeIdentifier(identifier: string): string {
    return escapeAnsiIdentifier(identifier);
  }

  public assertSafeIdentifier(identifier: string, context: string): string {
    return assertSafeIdentifier(identifier, context);
  }

  public boolLiteral(value: boolean): string {
    return value ? '1' : '0';
  }

  public deleteOne(table: string, where: string): string {
    return `DELETE FROM ${table} WHERE ${where}`;
  }

  public disableFks(): string {
    return 'PRAGMA foreign_keys=OFF';
  }

  public enableFks(): string {
    return 'PRAGMA foreign_keys=ON';
  }

  public async dump(exec: Exec, artifact: string): Promise<void> {
    const command = `cp "${this.file()}" "${artifact}"`;
    const output = await exec(command);
    if (output.code !== 0) {
      throw new Error(`Backup failed with status code ${output.code}: ${output.stderr}`);
    }
  }

  public async restore(exec: Exec, artifact: string): Promise<void> {
    const command = `cp "${artifact}" "${this.file()}"`;
    const output = await exec(command);
    if (output.code !== 0) {
      throw new Error(`Restore failed with status code ${output.code}: ${output.stderr}`);
    }
  }

  public async postRestoreFixups(_exec: Exec): Promise<void> {
    return;
  }

  public async listTables(exec: Exec): Promise<string[]> {
    return (await this.executeSql(
      exec,
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`,
    ))
      .split('\n')
      .filter(Boolean);
  }

  public async dropAllTables(exec: Exec): Promise<void> {
    await this.executeSql(exec, this.disableFks());
    const tables = await this.listTables(exec);
    for (const t of tables) {
      await this.executeSql(
        exec,
        `DROP TABLE IF EXISTS ${escapeAnsiIdentifier(assertSafeIdentifier(t, 'table_name'))}`,
      );
    }
    await this.executeSql(exec, this.enableFks());
  }

  public async executeSql(exec: Exec, sql: string): Promise<string> {
    const command = [
      'sqlite3',
      this.file(),
      `\\"${sql.replaceAll(/[$`"]/g, '\\\\\\$&')}\\"`,
    ].join(' ');
    this.logger.debug(`Executing SQL: ${sql}`);
    const output = await exec(command);
    if (output.code !== 0) {
      throw new Error(
        `Execution of SQL failed with status code ${output.code}: ${output.stderr}`,
      );
    }
    return output.stdout;
  }
}
