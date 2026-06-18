import { describe, it, expect, jest } from '@jest/globals';
import { MysqlDriver } from './mysql.driver.js';
import { Exec } from './db-driver.interface.js';
import { DEFAULT_CONTAINER_IMAGE } from '../../container/container.constants.js';

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

  it('clientImage equals DEFAULT_CONTAINER_IMAGE (mysql image)', () => {
    expect(driverWith().driver.clientImage).toBe(DEFAULT_CONTAINER_IMAGE);
  });

  it('usesSidecar is true (MySQL requires a database server sidecar)', () => {
    expect(driverWith().driver.usesSidecar).toBe(true);
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

  it('escapes backticks in the wire command (regression)', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.executeSql(exec as unknown as Exec, 'ALTER TABLE `t1` CONVERT TO CHARACTER SET utf8mb4');
    expect(calls()[0]).toContain('\\\\\\\`t1\\\\\\\`');
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
  it('returns table names, filtering blank lines', async () => {
    const { driver, exec } = driverWith(() => ({ code: 0, stdout: 'foo\nbar\n', stderr: '' }));
    expect(await driver.listTables(exec as unknown as Exec)).toEqual(['foo', 'bar']);
  });
});

describe('MysqlDriver.restore', () => {
  it('throws when mysql exits non-zero', async () => {
    const { driver, exec } = driverWith(() => ({ code: 2, stdout: '', stderr: 'corrupt' }));
    await expect(driver.restore(exec as unknown as Exec, '/tmp/backup.sql')).rejects.toThrow(
      /Restore failed with status code 2: corrupt/,
    );
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

describe('MysqlDriver.dropAllTables', () => {
  it('does nothing when there are no tables', async () => {
    const { driver, exec } = driverWith(() => ({ code: 0, stdout: '', stderr: '' }));
    await driver.dropAllTables(exec as unknown as Exec);
    // Only one exec call: the listTables query
    expect((exec as jest.Mock<any>).mock.calls).toHaveLength(1);
  });

  it('emits SET foreign_key_checks=0, DROP TABLE IF EXISTS, SET foreign_key_checks=1', async () => {
    let callCount = 0;
    const { driver, exec, calls } = driverWith(() => {
      callCount++;
      // First call is listTables, return two table names
      if (callCount === 1) return { code: 0, stdout: 'foo\nbar\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    });
    await driver.dropAllTables(exec as unknown as Exec);
    // Second call should be the DROP statement
    expect(calls()[1]).toContain('SET foreign_key_checks = 0');
    expect(calls()[1]).toContain('DROP TABLE IF EXISTS');
    // backticks are shell-escaped in the wire command by executeSql
    expect(calls()[1]).toContain('foo');
    expect(calls()[1]).toContain('bar');
    expect(calls()[1]).toContain('SET foreign_key_checks = 1');
  });
});
