# DbDriver Seam (Plan 1 of 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a `DbDriver` abstraction and move all existing MySQL logic behind it as `MysqlDriver`, with `SqlService` delegating — a pure refactor with no behavior change.

**Architecture:** Introduce a `DbDriver` interface (dialect-only: dump/restore/introspect/escape/dialect-helpers) and an `Exec` callback type bound to a platform sidecar. A `DbDriverFactory` selects a driver from `DatabaseConfig.client` (defaulting to `mysql`). `SqlService` constructs the driver in its `databaseConfig` setter and delegates every method; `DirectusUserService` builds SQL through driver helpers instead of importing `escapeMysqlString` directly. No public `SqlService` method names change, so the 6 consumers are untouched.

**Tech Stack:** TypeScript (ESM), NestJS, Jest + ts-jest (`node --experimental-vm-modules`), shelljs `ExecOutputReturnValue`.

## Global Constraints

- ESM project (`"type": "module"`): all relative imports end in `.js`; jest `moduleNameMapper` rewrites `.js`→source.
- Run tests with: `pnpm test` (alias for `node --experimental-vm-modules node_modules/jest/bin/jest.js`). Single file: `pnpm test -- src/sql/mysql-driver.spec.ts`.
- `src/sql/sql-escape.ts` has a **100% coverage threshold** (branches/functions/lines/statements) in jest config — do not drop coverage on it; if logic moves out, move its tests too or keep the functions exercised.
- Conventional Commits for messages. **Never add `Co-Authored-By` lines** (user global rule).
- This is a **no-behavior-change refactor**: the full existing suite must stay green after every task.
- `DbDriver.client` values mirror Directus `DB_CLIENT`: `'mysql' | 'pg' | 'sqlite3'`.
- Touch only `src/sql/**` and `src/directus/directus-user/**`. No consumer or platform files change in this plan.

---

### Task 1: `DbDriver` interface + `MysqlDriver`

**Files:**
- Create: `src/sql/db-driver/db-driver.interface.ts`
- Create: `src/sql/db-driver/mysql.driver.ts`
- Create: `src/sql/db-driver/mysql.driver.spec.ts`
- Modify: `src/backup-db/database-config.interface.ts` (add optional `client`)

**Interfaces:**
- Consumes: `escapeMysqlString`, `escapeMysqlIdentifier`, `assertSafeIdentifier`, `assertSafeCharsetOrCollation` from `../sql-escape.js`; `DatabaseConfig` from `../../backup-db/database-config.interface.js`; `ExecOutputReturnValue` from `shelljs`.
- Produces:
  - `type Exec = (command: string) => Promise<ExecOutputReturnValue>`
  - `interface DbDriver` with: `client`, `dump(exec, artifact, tables?)`, `restore(exec, artifact)`, `postRestoreFixups(exec)`, `listTables(exec)`, `executeSql(exec, sql)`, `escapeString(v)`, `escapeIdentifier(v)`, `assertSafeIdentifier(v, ctx)`, `boolLiteral(b)`, `deleteOne(table, where)`, `disableFks()`, `enableFks()`.
  - `class MysqlDriver implements DbDriver` constructed with `(config: DatabaseConfig, logger: Logger)`.

- [ ] **Step 1: Add `client` to `DatabaseConfig`**

In `src/backup-db/database-config.interface.ts`:

```ts
export interface DatabaseConfig {
  client?: 'mysql' | 'pg' | 'sqlite3';
  host: string;
  port: string;
  name: string;
  user: string;
  password: string;
}
```

- [ ] **Step 2: Define the interface + `Exec` type**

Create `src/sql/db-driver/db-driver.interface.ts`:

```ts
import { ExecOutputReturnValue } from 'shelljs';

export type Exec = (command: string) => Promise<ExecOutputReturnValue>;

export interface DbDriver {
  readonly client: 'mysql' | 'pg' | 'sqlite3';

  dump(exec: Exec, artifact: string, tables?: string[]): Promise<void>;
  restore(exec: Exec, artifact: string): Promise<void>;
  postRestoreFixups(exec: Exec): Promise<void>;

  listTables(exec: Exec): Promise<string[]>;

  executeSql(exec: Exec, sql: string): Promise<string>;

  escapeString(value: string): string;
  escapeIdentifier(identifier: string): string;
  assertSafeIdentifier(identifier: string, context: string): string;

  boolLiteral(value: boolean): string;
  deleteOne(table: string, where: string): string;
  disableFks(): string;
  enableFks(): string;
}
```

- [ ] **Step 3: Write the failing test for `MysqlDriver`**

Create `src/sql/db-driver/mysql.driver.spec.ts`. These assertions are lifted from the current `sql.service.spec.ts` so behavior is provably preserved:

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { MysqlDriver } from './mysql.driver.js';
import { Exec } from './db-driver.interface.js';

type ExecOutput = { code: number; stdout: string; stderr: string };

function driverWith(execImpl?: (cmd: string) => ExecOutput): {
  driver: MysqlDriver;
  exec: jest.Mock<any>;
  calls: () => string[];
} {
  const exec = jest.fn(async (cmd: string) =>
    execImpl ? execImpl(cmd) : { code: 0, stdout: '', stderr: '' },
  ) as jest.Mock<any>;
  const logger = { debug: jest.fn() } as never;
  const driver = new MysqlDriver(
    { client: 'mysql', host: 'h', port: '3306', user: 'u', password: 'p@ss', name: 'mydb' },
    logger,
  );
  return { driver, exec: exec as never, calls: () => exec.mock.calls.map((c: any[]) => c[0] as string) };
}

describe('MysqlDriver basics', () => {
  it('reports its client', () => {
    expect(driverWith().driver.client).toBe('mysql');
  });

  it('quotes identifiers with backticks and bool literal as 1', () => {
    const { driver } = driverWith();
    expect(driver.escapeIdentifier('t1')).toBe('`t1`');
    expect(driver.boolLiteral(true)).toBe('1');
  });

  it('deleteOne appends LIMIT 1', () => {
    const { driver } = driverWith();
    expect(driver.deleteOne('directus_users', 'id = 1')).toBe(
      'DELETE FROM directus_users WHERE id = 1 LIMIT 1',
    );
  });
});

describe('MysqlDriver.executeSql', () => {
  it('escapes $ and backticks in the wire command (regression)', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.executeSql(exec as unknown as Exec, "SELECT '$x' FROM t");
    expect(calls()[0]).toContain('\\\\\\$x');
  });

  it('throws on non-zero exit, including stderr', async () => {
    const { driver, exec } = driverWith(() => ({ code: 1, stdout: '', stderr: 'boom' }));
    await expect(driver.executeSql(exec as unknown as Exec, 'SELECT 1')).rejects.toThrow(
      /Execution of SQL failed with status code 1: boom/,
    );
  });

  it('returns stdout on success', async () => {
    const { driver, exec } = driverWith(() => ({ code: 0, stdout: 'hello\n', stderr: '' }));
    expect(await driver.executeSql(exec as unknown as Exec, 'SELECT 1')).toBe('hello\n');
  });
});

describe('MysqlDriver.listTables', () => {
  it('drops the header row and trims blanks', async () => {
    const { driver, exec } = driverWith(() => ({ code: 0, stdout: 'foo\nbar\n', stderr: '' }));
    expect(await driver.listTables(exec as unknown as Exec)).toEqual(['foo', 'bar']);
  });
});

describe('MysqlDriver.dump', () => {
  it('throws when mysqldump exits non-zero', async () => {
    const { driver, exec } = driverWith(() => ({ code: 3, stdout: '', stderr: 'denied' }));
    await expect(driver.dump(exec as unknown as Exec, '/tmp/backup.sql')).rejects.toThrow(
      /Backup failed with status code 3: denied/,
    );
  });

  it('appends the joined table list when provided', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.dump(exec as unknown as Exec, '/tmp/backup.sql', ['a', 'b']);
    expect(calls()[0]).toContain(' mydb a b ');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test -- src/sql/db-driver/mysql.driver.spec.ts`
Expected: FAIL — `Cannot find module './mysql.driver.js'`.

- [ ] **Step 5: Implement `MysqlDriver`**

Create `src/sql/db-driver/mysql.driver.ts`. The bodies are moved verbatim from `src/sql/sql.service.ts` (`performMysqlDump` lines 83-114, `restoreMysqlDump` 116-194, `listTables` 196-206, `executeSql` 208-233), parameterised on `exec`:

```ts
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

export class MysqlDriver implements DbDriver {
  public readonly client = 'mysql' as const;

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
```

> Note: `postRestoreFixups` keeps `listTables`-style introspection inline (it filters by `BASE TABLE` exactly as the original `restoreMysqlDump`). The original combined restore+fixups in one method; `SqlService` will call `restore` then `postRestoreFixups` in Task 3, preserving order.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test -- src/sql/db-driver/mysql.driver.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add src/sql/db-driver/db-driver.interface.ts src/sql/db-driver/mysql.driver.ts src/sql/db-driver/mysql.driver.spec.ts src/backup-db/database-config.interface.ts
git commit -m "feat(sql): add DbDriver interface and MysqlDriver"
```

---

### Task 2: `DbDriverFactory`

**Files:**
- Create: `src/sql/db-driver/db-driver.factory.ts`
- Create: `src/sql/db-driver/db-driver.factory.spec.ts`

**Interfaces:**
- Consumes: `MysqlDriver` (Task 1), `DbDriver`, `DatabaseConfig`, `Logger`.
- Produces: `function createDbDriver(config: DatabaseConfig, logger: Logger): DbDriver` — selects by `config.client`, defaults to `mysql` when absent; throws on an unknown client.

- [ ] **Step 1: Write the failing test**

Create `src/sql/db-driver/db-driver.factory.spec.ts`:

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { createDbDriver } from './db-driver.factory.js';

const logger = { debug: jest.fn() } as never;
const base = { host: 'h', port: '3306', user: 'u', password: 'p', name: 'd' };

describe('createDbDriver', () => {
  it('defaults to mysql when client is absent', () => {
    expect(createDbDriver(base as never, logger).client).toBe('mysql');
  });

  it('returns a mysql driver for client=mysql', () => {
    expect(createDbDriver({ ...base, client: 'mysql' } as never, logger).client).toBe('mysql');
  });

  it('throws on an unknown client', () => {
    expect(() => createDbDriver({ ...base, client: 'oracle' } as never, logger)).toThrow(
      /Unsupported database client: oracle/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/sql/db-driver/db-driver.factory.spec.ts`
Expected: FAIL — `Cannot find module './db-driver.factory.js'`.

- [ ] **Step 3: Implement the factory**

Create `src/sql/db-driver/db-driver.factory.ts`:

```ts
import { Logger } from 'winston';
import { DatabaseConfig } from '../../backup-db/database-config.interface.js';
import { DbDriver } from './db-driver.interface.js';
import { MysqlDriver } from './mysql.driver.js';

export function createDbDriver(config: DatabaseConfig, logger: Logger): DbDriver {
  const client = config.client ?? 'mysql';
  switch (client) {
    case 'mysql':
      return new MysqlDriver(config, logger);
    default:
      throw new Error(`Unsupported database client: ${client}`);
  }
}
```

> Plans 2 add `case 'pg'` and `case 'sqlite3'` here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/sql/db-driver/db-driver.factory.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sql/db-driver/db-driver.factory.ts src/sql/db-driver/db-driver.factory.spec.ts
git commit -m "feat(sql): add DbDriverFactory selecting by client"
```

---

### Task 3: `SqlService` delegates to the driver

**Files:**
- Modify: `src/sql/sql.service.ts`
- Modify: `src/sql/sql.service.spec.ts`

**Interfaces:**
- Consumes: `createDbDriver` (Task 2), `DbDriver`/`Exec` (Task 1).
- Produces: unchanged public surface — `databaseConfig` setter, `performMysqlDump(cs, tables?)`, `restoreMysqlDump(cs)`, `listTables(cs)`, `executeSql(sql, cs)`, `setAssetStorage(storage, cs)`, plus the directus-user delegators. Internally each builds `exec = (cmd) => cs.execute(cmd)` and calls the driver. Adds a private `get driver(): DbDriver`.

- [ ] **Step 1: Update `sql.service.spec.ts` to the delegating behavior**

The existing dump/restore/listTables/executeSql assertions now live in `mysql.driver.spec.ts` (Task 1). `sql.service.spec.ts` keeps the redaction + asset-storage + delegation checks. Replace the whole describe-block body's per-method SQL tests with delegation tests; keep `build()` but drop the `containerService` SQL-shape assertions that moved. Add:

```ts
describe('SqlService delegates to the driver', () => {
  it('builds a mysql driver from databaseConfig and routes executeSql through it', async () => {
    const { service, containerService } = build(() => ({ code: 0, stdout: 'ok\n', stderr: '' }));
    const out = await service.executeSql('SELECT 1', containerService as never);
    expect(out).toBe('ok\n');
    // wire command still mysql-shaped
    expect(containerService.execute.mock.calls[0][0]).toContain('mysql -sN');
  });

  it('performMysqlDump still appends the table list', async () => {
    const { service, containerService } = build();
    await service.performMysqlDump(containerService as never, ['a', 'b']);
    expect(containerService.execute.mock.calls[0][0]).toContain(' mydb a b ');
  });

  it('restoreMysqlDump runs restore then post-restore fixups', async () => {
    const { service, containerService } = build((cmd) =>
      cmd.includes('DEFAULT_COLLATION_NAME')
        ? { code: 0, stdout: 'utf8mb4_unicode_ci\n', stderr: '' }
        : cmd.includes('default_character_set_name')
          ? { code: 0, stdout: 'utf8mb4\n', stderr: '' }
          : cmd.includes('TABLE_TYPE')
            ? { code: 0, stdout: 't1\n', stderr: '' }
            : { code: 0, stdout: '', stderr: '' },
    );
    await service.restoreMysqlDump(containerService as never);
    const cmds = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    expect(cmds.some((c) => c.includes('CONVERT TO CHARACTER SET utf8mb4'))).toBe(true);
  });
});
```

Keep the two existing redaction tests and the two `setAssetStorage` tests unchanged.

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm test -- src/sql/sql.service.spec.ts`
Expected: FAIL — `restoreMysqlDump` no longer does fixups inline / `this.driver` undefined.

- [ ] **Step 3: Refactor `SqlService` to delegate**

In `src/sql/sql.service.ts`: import `createDbDriver` and `Exec`; store a `_driver`; build it in the setter; replace method bodies with delegation. Replace the file's class body with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';
import { highlight } from 'cli-highlight';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { ContainerService } from '../container/container.service.js';
import { Credential } from '../directus/directus-user/credential.type.js';
import { RedactService } from '../redact/redact.service.js';
import { DbDriver, Exec } from './db-driver/db-driver.interface.js';
import { createDbDriver } from './db-driver/db-driver.factory.js';

@Injectable()
export class SqlService {
  private _databaseConfig: DatabaseConfig;
  private _driver: DbDriver;

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
    this._driver = createDbDriver(config, this.logger);
  }

  private get driver(): DbDriver {
    return this._driver;
  }

  private execFor(containerService: ContainerService): Exec {
    return (command: string) => containerService.execute(command);
  }

  public async setupDirectusUser(containerService: ContainerService) {
    await this.directusUserService.setupUser(this.driver, (sql) =>
      this.driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async cleanUpDirectusUser(containerService: ContainerService) {
    await this.directusUserService.removeUser(this.driver, (sql) =>
      this.driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async cleanUpAllDirectusUsers(containerService: ContainerService) {
    await this.directusUserService.cleanUp(this.driver, (sql) =>
      this.driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async setCredentials(credentials: Credential[], containerService: ContainerService) {
    if (!credentials || credentials.length === 0) {
      return;
    }
    await this.directusUserService.setCredentials(credentials, this.driver, (sql) =>
      this.driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async setAssetStorage(storage: string, containerService: ContainerService) {
    if (!storage) {
      return;
    }
    const escaped = this.driver.escapeString(storage);
    await this.driver.executeSql(
      this.execFor(containerService),
      `UPDATE directus_files SET storage = ${escaped} WHERE storage <> ${escaped} OR storage IS NULL;`,
    );
  }

  public async performMysqlDump(containerService: ContainerService, tableNames?: string[]) {
    await this.driver.dump(this.execFor(containerService), '/tmp/backup.sql', tableNames);
  }

  public async restoreMysqlDump(containerService: ContainerService) {
    const exec = this.execFor(containerService);
    await this.driver.restore(exec, '/tmp/backup.sql');
    await this.driver.postRestoreFixups(exec);
  }

  public async listTables(containerService: ContainerService) {
    return this.driver.listTables(this.execFor(containerService));
  }

  public async executeSql(sql: string, containerService: ContainerService) {
    return this.driver.executeSql(this.execFor(containerService), sql);
  }
}
```

> `MysqlExecutor` callers in `DirectusUserService` change in Task 4 (added `driver` first param). This step's `setup/remove/cleanUp/setCredentials` calls already pass `this.driver` — they will only compile after Task 4. Implement Task 4 immediately after; do not run the full suite green until then. (If you need an intermediate green, temporarily keep the old `DirectusUserService` signatures — but prefer doing 3+4 back to back.)

- [ ] **Step 4: Run the `SqlService` spec**

Run: `pnpm test -- src/sql/sql.service.spec.ts`
Expected: compile errors against `DirectusUserService` signatures (resolved in Task 4). Proceed to Task 4 before judging green.

- [ ] **Step 5: Commit (with Task 4)**

Defer the commit until Task 4 compiles. See Task 4 Step 5.

---

### Task 4: `DirectusUserService` uses driver helpers

**Files:**
- Modify: `src/directus/directus-user/directus-user.service.ts`
- Modify: `src/sql/mysql-executor.type.ts` (rename intent only — keep the type)
- Create/Modify: `src/directus/directus-user/directus-user.service.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `DbDriver` (Task 1) — uses `escapeString`, `boolLiteral`, `deleteOne`, `assertSafeIdentifier`-style helpers; `MysqlExecutor` callback type (kept as `SqlExecutor`).
- Produces: methods now take `(driver: DbDriver, execSql: SqlExecutor)`:
  - `setupUser(driver, execSql)`, `removeUser(driver, execSql)`, `setCredentials(creds, driver, execSql)`, `cleanUp(driver, execSql)`.

- [ ] **Step 1: Write the failing test**

Create `src/directus/directus-user/directus-user.service.spec.ts`:

```ts
import { describe, it, expect, jest } from '@jest/globals';
import { DirectusUserService } from './directus-user.service.js';

function fakeDriver() {
  return {
    escapeString: (v: string) => `'${v}'`,
    boolLiteral: (b: boolean) => (b ? '1' : '0'),
    deleteOne: (t: string, w: string) => `DELETE FROM ${t} WHERE ${w} LIMIT 1`,
  } as never;
}

describe('DirectusUserService.setupUser', () => {
  it('uses the driver bool literal for admin_access', async () => {
    const svc = new DirectusUserService({ addRedaction: jest.fn() } as never);
    const sql: string[] = [];
    await svc.setupUser(fakeDriver(), async (s) => {
      sql.push(s);
      return '';
    });
    expect(sql.some((s) => s.includes('admin_access) VALUES') && s.includes(', 1)'))).toBe(true);
  });
});

describe('DirectusUserService.removeUser', () => {
  it('uses the driver deleteOne helper', async () => {
    const svc = new DirectusUserService({ addRedaction: jest.fn() } as never);
    const sql: string[] = [];
    await svc.removeUser(fakeDriver(), async (s) => {
      sql.push(s);
      return '';
    });
    expect(sql.some((s) => /DELETE FROM directus_users WHERE id = .* LIMIT 1/.test(s))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/directus/directus-user/directus-user.service.spec.ts`
Expected: FAIL — `setupUser` expects 1 arg / `admin_access` hardcoded.

- [ ] **Step 3: Refactor `DirectusUserService`**

In `src/directus/directus-user/directus-user.service.ts`: import `DbDriver`; drop the direct `escapeMysqlString` import for escaping (keep `assertUuid`); thread `driver` through. Key edits:

- Signature `setupUser(driver: DbDriver, execSql: SqlExecutor)`; replace every `escapeMysqlString(x)` with `driver.escapeString(x)`.
- In the policies insert, replace the literal `admin_access, ... 1)` with `driver.boolLiteral(true)`:

```ts
await execSql(
  `INSERT INTO directus_policies (id, name, admin_access) VALUES (${policyId}, ${username}, ${driver.boolLiteral(true)})`,
);
```

- `removeUser(driver, execSql)`: replace the three `DELETE FROM x WHERE id = … LIMIT 1` with `driver.deleteOne('directus_users', \`id = ${userId}\`)` etc.
- `setCredentials(credentials, driver, execSql)` and `cleanUp(driver, execSql)`: replace `escapeMysqlString` with `driver.escapeString`. The `LIKE 'migrateus%'` bulk DELETEs stay as-is (no `LIMIT`, valid in all three engines).

Keep `assertUuid` from `../../sql/sql-escape.js` (engine-agnostic validation).

- [ ] **Step 4: Run the directus-user + sql.service specs**

Run: `pnpm test -- src/directus/directus-user/directus-user.service.spec.ts src/sql/sql.service.spec.ts`
Expected: PASS for both.

- [ ] **Step 5: Run the FULL suite, then commit**

Run: `pnpm test`
Expected: PASS — entire existing suite green (no behavior change).

```bash
git add src/sql/sql.service.ts src/sql/sql.service.spec.ts src/directus/directus-user/directus-user.service.ts src/directus/directus-user/directus-user.service.spec.ts
git commit -m "refactor(sql): route SqlService and DirectusUserService through DbDriver"
```

---

## Self-Review

**Spec coverage (Plan 1 scope only):**
- `DbDriver` interface — Task 1 ✓
- `MysqlDriver` (moves existing MySQL logic) — Task 1 ✓
- Driver selection by `DB_CLIENT` (default mysql) — Task 2 ✓
- `SqlService` thin orchestrator delegating to driver — Task 3 ✓
- `DirectusUserService`/`setAssetStorage` build SQL via driver — Tasks 3–4 ✓
- Postgres/SQLite drivers, transfer flow, platforms, `migrateus.yml` — **out of scope**, covered by Plans 2–5 below.

**Placeholder scan:** no TBD/TODO; every code step shows full code. The only deferred marker is the factory's `// Plans 2 add …` comment, which is intentional and compiles.

**Type consistency:** `Exec`, `DbDriver` method names, and `createDbDriver` signature are identical across Tasks 1–3. `DirectusUserService` methods consistently gain `driver` as the param before/with `execSql` (Tasks 3 call sites match Task 4 signatures). `restoreMysqlDump` = `restore` + `postRestoreFixups` ordering preserved.

---

## Roadmap: Plans 2–5 (to be detailed when Plan 1 lands)

- **Plan 2 — Postgres & SQLite drivers.** Implement `PostgresDriver` (`pg_dump`/`psql`, `"`-quoting, `information_schema`, `session_replication_role`, `boolLiteral 'true'`, plain `deleteOne`, sequence-reset fixups) and `SqliteDriver` (file copy dump/restore via `exfilFile`/`infilFile`, `sqlite_master`, `PRAGMA foreign_keys`, path-not-host connect). Extend `createDbDriver` with `case 'pg'` / `case 'sqlite3'`. New `escapePgString`/`escapePgIdentifier` in `sql-escape.ts` with their own tests (respect the 100% coverage threshold). Unit-test each driver in isolation.
  - **Carried over from Plan 1's final review (must address in Plan 2):**
    - `src/rename-collection/rename-collection.service.ts` still emits raw MySQL outside the driver seam — it imports `escapeMysqlIdentifier`/`escapeMysqlString`/`assertSafeIdentifier` directly and hardcodes backtick `ALTER TABLE … RENAME TO`, `SET foreign_key_checks = 0/1`, and aliased-column UPDATEs. Route it through the active `DbDriver` (`escapeIdentifier`, `disableFks`/`enableFks`, driver-built statements) so rename-collection works on Postgres/SQLite. This was correctly out of scope for Plan 1 (which only touched `src/sql/**` + directus-user).
    - Deferred Plan 1 Minors to tidy while editing these files: remove the stray `// Plans 2 add 'pg'/'sqlite3'` comment after the `default:` throw in `db-driver.factory.ts`; remove the now-dead `_databaseConfig` field in `sql.service.ts` (only `_driver` is read).
- **Plan 3 — cross-engine transfer.** Artifact `manifest` (sourceEngine/version/tables/timestamp); `TransferPlanner` choosing native vs pgloader from `(manifest.sourceEngine, targetEngine)`; pgloader invocation in the target sidecar; the Directus-tuned pgloader **cast-rules file** + tests; MySQL→PG temp-MySQL shim (or defer).
- **Plan 4 — platforms.** `docker`/`docker-compose` `host` (`DOCKER_HOST=ssh://…`) injection; Swarm service→container resolution; sidecar `--network container:<id>`. New `aca` platform (`az containerapp` create/exec/delete; Azure Files for large artifacts) mirroring the k8s service.
- **Plan 5 — `migrateus.yml` + engine detection.** New `DockerEnvironment.host/service`, `AcaEnvironment`, optional `db` override; platform discovery sets `DatabaseConfig.client` from `DB_CLIENT` (and `DB_FILENAME` for sqlite); command wiring (`backup-db` no `--target`, `restore-db --artifact`, `schema-diff --source/--target`).
