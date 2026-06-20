import { LoggerService } from '../../logger/logger.service.js';
import { highlight } from 'cli-highlight';
import { DatabaseConfig } from '../../backup-db/database-config.interface.js';
import { DbDriver, Exec } from './db-driver.interface.js';
import { throwIfFailed } from '../../util/exec.js';
import {
  assertSafeIdentifier,
  escapeAnsiIdentifier,
  escapeAnsiString,
} from '../sql-escape.js';
import { DEFAULT_CONTAINER_IMAGE } from '../../container/container.constants.js';

export class PostgresDriver implements DbDriver {
  public readonly client = 'pg' as const;
  public readonly clientImage = DEFAULT_CONTAINER_IMAGE;
  public readonly usesSidecar = true;

  constructor(
    private readonly config: DatabaseConfig,
    private readonly logger: LoggerService,
  ) {}

  public escapeString(value: string): string {
    return escapeAnsiString(value);
  }

  public escapeIdentifier(identifier: string): string {
    return escapeAnsiIdentifier(identifier);
  }

  public assertSafeIdentifier(identifier: string, context: string): string {
    return assertSafeIdentifier(identifier, context);
  }

  public disableFks(): string {
    return 'SET session_replication_role = replica';
  }

  public enableFks(): string {
    return 'SET session_replication_role = origin';
  }

  public async dump(
    exec: Exec,
    artifact: string,
    tables?: string[],
  ): Promise<void> {
    const { host, port, user, password, name } = this.config;
    const tableFlags = tables
      ? tables
          .map((t) => `-t ${assertSafeIdentifier(t, 'table_name')}`)
          .join(' ')
      : '';
    const command = [
      `PGPASSWORD=${password}`,
      'pg_dump',
      `-h${host}`,
      `-p${port}`,
      `-U${user}`,
      tableFlags,
      name,
      `>${artifact}`,
    ]
      .filter(Boolean)
      .join(' ');

    throwIfFailed(
      await exec(command),
      (o) => `Backup failed with status code ${o.code}: ${o.stderr}`,
    );
  }

  public async restore(exec: Exec, artifact: string): Promise<void> {
    const { host, port, user, password, name } = this.config;
    const command = [
      `PGPASSWORD=${password}`,
      'psql',
      `-h${host}`,
      `-p${port}`,
      `-U${user}`,
      `-d${name}`,
      `<${artifact}`,
    ].join(' ');

    throwIfFailed(
      await exec(command),
      (o) => `Restore failed with status code ${o.code}: ${o.stderr}`,
    );
  }

  // TODO(plan-3): verify sequence reset against a live Directus PG
  public async postRestoreFixups(_exec: Exec): Promise<void> {
    this.logger.debug(
      'Postgres sequence reset skipped — pgloader/Directus handle sequences',
    );
  }

  public async listTables(exec: Exec): Promise<string[]> {
    return (
      await this.executeSql(
        exec,
        `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';`,
      )
    )
      .split('\n')
      .filter(Boolean);
  }

  public async dropAllTables(exec: Exec): Promise<void> {
    await this.executeSql(
      exec,
      'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    );
  }

  public async executeSql(exec: Exec, sql: string): Promise<string> {
    const { host, port, user, password, name } = this.config;
    const command = [
      `PGPASSWORD=${password}`,
      'psql',
      '-tA',
      `-h${host}`,
      `-p${port}`,
      `-U${user}`,
      `-d${name}`,
      '-c',
      `\\"${sql.replaceAll(/[$`"]/g, '\\\\\\$&')}\\"`,
    ];
    this.logger.debug(
      `Executing SQL: ${highlight(sql, { language: 'sql', ignoreIllegals: true })}`,
    );
    const output = throwIfFailed(
      await exec(command.join(' ')),
      (o) => `Execution of SQL failed with status code ${o.code}: ${o.stderr}`,
    );
    return output.stdout;
  }
}
