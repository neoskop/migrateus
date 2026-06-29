import { LoggerService } from '../../logger/logger.service.js';
import { DatabaseConfig } from '../../backup-db/database-config.interface.js';
import { DbDriver, Exec } from './db-driver.interface.js';
import { throwIfFailed } from '../../util/exec.js';
import {
  assertSafeIdentifier,
  escapeAnsiIdentifier,
  escapeAnsiString,
} from '../sql-escape.js';
import { DEFAULT_CONTAINER_IMAGE } from '../../container/container.constants.js';
import { shquote } from '../../util/sh-quote.js';

// Runs one SQL statement against a SQLite file using the `sqlite3` node module
// that Directus bundles, printing the result as the `sqlite3` CLI would (column
// values joined by '|', rows by '\n'). argv: [modulePath, dbFile, sql].
const SQLITE_NODE_PROGRAM =
  'const s=require(process.argv[1]);' +
  'const db=new s.Database(process.argv[2]);' +
  'db.all(process.argv[3],(e,rows)=>{' +
  'if(e){process.stderr.write(String((e&&e.message)||e));process.exit(1);}' +
  'process.stdout.write((rows||[]).map(r=>Object.values(r).join("|")).join("\\n"));' +
  'db.close();});';

export class SqliteDriver implements DbDriver {
  public readonly client = 'sqlite3' as const;
  public readonly clientImage = DEFAULT_CONTAINER_IMAGE;
  // SQLite is a file, copied directly to/from the Directus container — no sidecar needed.
  public readonly usesSidecar = false;

  constructor(
    private readonly config: DatabaseConfig,
    private readonly logger: LoggerService,
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

  public disableFks(): string {
    return 'PRAGMA foreign_keys=OFF';
  }

  public enableFks(): string {
    return 'PRAGMA foreign_keys=ON';
  }

  public async dump(exec: Exec, artifact: string): Promise<void> {
    const command = `cp "${this.file()}" "${artifact}"`;
    throwIfFailed(
      await exec(command),
      (o) => `Backup failed with status code ${o.code}: ${o.stderr}`,
    );
  }

  public async restore(exec: Exec, artifact: string): Promise<void> {
    const command = `cp "${artifact}" "${this.file()}"`;
    throwIfFailed(
      await exec(command),
      (o) => `Restore failed with status code ${o.code}: ${o.stderr}`,
    );
  }

  public async postRestoreFixups(_exec: Exec): Promise<void> {
    return;
  }

  public async listTables(exec: Exec): Promise<string[]> {
    return (
      await this.executeSql(
        exec,
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`,
      )
    )
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
    // SQLite SQL runs *inside* the Directus container (that is where the DB
    // file lives). The Directus image is Alpine and ships no `sqlite3` CLI, so
    // drive its bundled `sqlite3` node module instead. The module's nested
    // location differs between npm and pnpm installs, so resolve it at runtime
    // with `find` (covers both). This command is shquoted by `execInDirectus`,
    // so no manual shell escaping is needed here.
    // ponytail: assumes Directus's node_modules under /directus; fine — this
    // command only ever runs in the official Directus container.
    const command =
      `M=$(find /directus/node_modules -type d -path ${shquote('*/node_modules/sqlite3')} | head -n1); ` +
      `node -e ${shquote(SQLITE_NODE_PROGRAM)} "$M" ${shquote(this.file())} ${shquote(sql)}`;
    this.logger.debug(`Executing SQL: ${sql}`);
    const output = throwIfFailed(
      await exec(command),
      (o) => `Execution of SQL failed with status code ${o.code}: ${o.stderr}`,
    );
    return output.stdout;
  }
}
