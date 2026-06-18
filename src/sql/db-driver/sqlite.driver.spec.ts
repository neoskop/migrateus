import { describe, it, expect, jest } from '@jest/globals';
import { SqliteDriver } from './sqlite.driver.js';
import { Exec } from './db-driver.interface.js';

type ExecOutput = { code: number; stdout: string; stderr: string };

function driverWith(execImpl?: (cmd: string) => ExecOutput, filename?: string): {
  driver: SqliteDriver;
  exec: jest.Mock<any>;
  calls: () => string[];
} {
  const exec = jest.fn(async (cmd: string) =>
    execImpl ? execImpl(cmd) : { code: 0, stdout: '', stderr: '' },
  ) as jest.Mock<any>;
  const logger = { debug: jest.fn() } as never;
  const config = filename
    ? { client: 'sqlite3' as const, host: 'localhost', port: '0', user: '', password: '', name: 'mydb.sqlite', filename }
    : { client: 'sqlite3' as const, host: 'localhost', port: '0', user: '', password: '', name: 'mydb.sqlite' };
  const driver = new SqliteDriver(config, logger);
  return { driver, exec: exec as never, calls: () => exec.mock.calls.map((c: any[]) => c[0] as string) };
}

describe('SqliteDriver basics', () => {
  it('reports its client', () => {
    expect(driverWith().driver.client).toBe('sqlite3');
  });

  it('quotes identifiers with double-quotes (ANSI)', () => {
    const { driver } = driverWith();
    expect(driver.escapeIdentifier('my_table')).toBe('"my_table"');
  });

  it('boolLiteral returns 1/0', () => {
    const { driver } = driverWith();
    expect(driver.boolLiteral(true)).toBe('1');
    expect(driver.boolLiteral(false)).toBe('0');
  });

  it('deleteOne does NOT append LIMIT', () => {
    const { driver } = driverWith();
    expect(driver.deleteOne('"users"', 'id = 1')).toBe('DELETE FROM "users" WHERE id = 1');
  });

  it('disableFks returns PRAGMA foreign_keys=OFF', () => {
    expect(driverWith().driver.disableFks()).toBe('PRAGMA foreign_keys=OFF');
  });

  it('enableFks returns PRAGMA foreign_keys=ON', () => {
    expect(driverWith().driver.enableFks()).toBe('PRAGMA foreign_keys=ON');
  });
});

describe('SqliteDriver file resolution', () => {
  it('uses config.filename when set', async () => {
    const { driver, exec, calls } = driverWith(undefined, '/data/app.db');
    await driver.dump(exec as unknown as Exec, '/tmp/backup.db');
    expect(calls()[0]).toContain('/data/app.db');
  });

  it('falls back to config.name when filename is absent', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.dump(exec as unknown as Exec, '/tmp/backup.db');
    expect(calls()[0]).toContain('mydb.sqlite');
  });
});

describe('SqliteDriver.executeSql', () => {
  it('uses sqlite3 with the db file path', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.executeSql(exec as unknown as Exec, 'SELECT 1');
    expect(calls()[0]).toContain('sqlite3');
    expect(calls()[0]).toContain('mydb.sqlite');
  });

  it('escapes $ in the SQL wire command', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.executeSql(exec as unknown as Exec, "SELECT '$x'");
    expect(calls()[0]).toContain('\\\\\\$x');
  });

  it('throws on non-zero exit with stderr', async () => {
    const { driver, exec } = driverWith(() => ({ code: 1, stdout: '', stderr: 'boom' }));
    await expect(driver.executeSql(exec as unknown as Exec, 'SELECT 1')).rejects.toThrow(
      /Execution of SQL failed with status code 1: boom/,
    );
  });

  it('returns stdout on success', async () => {
    const { driver, exec } = driverWith(() => ({ code: 0, stdout: 'result\n', stderr: '' }));
    expect(await driver.executeSql(exec as unknown as Exec, 'SELECT 1')).toBe('result\n');
  });
});

describe('SqliteDriver.dump', () => {
  it('uses cp to copy the db file to artifact', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.dump(exec as unknown as Exec, '/tmp/backup.db');
    const cmd = calls()[0];
    expect(cmd).toContain('cp');
    expect(cmd).toContain('mydb.sqlite');
    expect(cmd).toContain('/tmp/backup.db');
  });

  it('quotes both operands in the cp command (spaces-safe)', async () => {
    const { driver, exec, calls } = driverWith(undefined, '/data/my db.sqlite');
    await driver.dump(exec as unknown as Exec, '/tmp/my backup.db');
    const cmd = calls()[0];
    expect(cmd).toContain('"/data/my db.sqlite"');
    expect(cmd).toContain('"/tmp/my backup.db"');
  });

  it('throws on non-zero exit', async () => {
    const { driver, exec } = driverWith(() => ({ code: 1, stdout: '', stderr: 'no such file' }));
    await expect(driver.dump(exec as unknown as Exec, '/tmp/backup.db')).rejects.toThrow(
      /Backup failed with status code 1: no such file/,
    );
  });
});

describe('SqliteDriver.restore', () => {
  it('uses cp to copy artifact to the db file', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.restore(exec as unknown as Exec, '/tmp/backup.db');
    const cmd = calls()[0];
    expect(cmd).toContain('cp');
    expect(cmd).toContain('/tmp/backup.db');
    expect(cmd).toContain('mydb.sqlite');
  });

  it('quotes both operands in the cp command (spaces-safe)', async () => {
    const { driver, exec, calls } = driverWith(undefined, '/data/my db.sqlite');
    await driver.restore(exec as unknown as Exec, '/tmp/my backup.db');
    const cmd = calls()[0];
    expect(cmd).toContain('"/tmp/my backup.db"');
    expect(cmd).toContain('"/data/my db.sqlite"');
  });

  it('throws on non-zero exit', async () => {
    const { driver, exec } = driverWith(() => ({ code: 2, stdout: '', stderr: 'permission denied' }));
    await expect(driver.restore(exec as unknown as Exec, '/tmp/backup.db')).rejects.toThrow(
      /Restore failed with status code 2: permission denied/,
    );
  });
});

describe('SqliteDriver.listTables', () => {
  it('queries sqlite_master for table names', async () => {
    const { driver, exec, calls } = driverWith(() => ({ code: 0, stdout: 'users\norders\n', stderr: '' }));
    const tables = await driver.listTables(exec as unknown as Exec);
    expect(tables).toEqual(['users', 'orders']);
    expect(calls()[0]).toContain('sqlite_master');
  });
});

describe('SqliteDriver.dropAllTables', () => {
  it('emits PRAGMA foreign_keys=OFF, per-table DROPs, PRAGMA foreign_keys=ON', async () => {
    let callCount = 0;
    const { driver, exec, calls } = driverWith(() => {
      callCount++;
      // 1st call: disableFks, 2nd call: listTables, then DROP calls, then enableFks
      if (callCount === 2) return { code: 0, stdout: 'users\norders\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    });
    await driver.dropAllTables(exec as unknown as Exec);
    const allCalls = calls();
    // First call: PRAGMA foreign_keys=OFF
    expect(allCalls[0]).toContain('PRAGMA foreign_keys=OFF');
    // Middle calls: DROP TABLE IF EXISTS with ANSI-quoted identifiers
    const dropCalls = allCalls.filter(c => c.includes('DROP TABLE IF EXISTS'));
    expect(dropCalls.length).toBeGreaterThanOrEqual(1);
    // double-quotes are shell-escaped in the wire command by executeSql
    expect(dropCalls.some(c => c.includes('users'))).toBe(true);
    expect(dropCalls.some(c => c.includes('orders'))).toBe(true);
    // Last call: PRAGMA foreign_keys=ON
    expect(allCalls[allCalls.length - 1]).toContain('PRAGMA foreign_keys=ON');
  });

  it('still emits PRAGMA ON/OFF even when no tables exist', async () => {
    const { driver, exec, calls } = driverWith(() => ({ code: 0, stdout: '', stderr: '' }));
    await driver.dropAllTables(exec as unknown as Exec);
    const allCalls = calls();
    expect(allCalls[0]).toContain('PRAGMA foreign_keys=OFF');
    expect(allCalls[allCalls.length - 1]).toContain('PRAGMA foreign_keys=ON');
  });
});

describe('SqliteDriver.postRestoreFixups', () => {
  it('is a no-op (returns without calling exec)', async () => {
    const { driver, exec } = driverWith();
    await driver.postRestoreFixups(exec as unknown as Exec);
    expect((exec as jest.Mock<any>).mock.calls).toHaveLength(0);
  });
});
