import { describe, it, expect, jest } from '@jest/globals';
import { PostgresDriver } from './postgres.driver.js';
import { Exec } from './db-driver.interface.js';

type ExecOutput = { code: number; stdout: string; stderr: string };

function driverWith(execImpl?: (cmd: string) => ExecOutput): {
  driver: PostgresDriver;
  exec: jest.Mock<any>;
  calls: () => string[];
} {
  const exec = jest.fn(async (cmd: string) =>
    execImpl ? execImpl(cmd) : { code: 0, stdout: '', stderr: '' },
  ) as jest.Mock<any>;
  const logger = { debug: jest.fn() } as never;
  const driver = new PostgresDriver(
    { client: 'pg', host: 'h', port: '5432', user: 'u', password: 'p@ss', name: 'pgdb' },
    logger,
  );
  return { driver, exec: exec as never, calls: () => exec.mock.calls.map((c: any[]) => c[0] as string) };
}

describe('PostgresDriver basics', () => {
  it('reports its client', () => {
    expect(driverWith().driver.client).toBe('pg');
  });

  it('usesSidecar is true (Postgres requires a database server sidecar)', () => {
    expect(driverWith().driver.usesSidecar).toBe(true);
  });

  it('quotes identifiers with double-quotes (ANSI)', () => {
    const { driver } = driverWith();
    expect(driver.escapeIdentifier('my_table')).toBe('"my_table"');
  });


  it('disableFks returns SET session_replication_role = replica', () => {
    expect(driverWith().driver.disableFks()).toBe('SET session_replication_role = replica');
  });

  it('enableFks returns SET session_replication_role = origin', () => {
    expect(driverWith().driver.enableFks()).toBe('SET session_replication_role = origin');
  });
});

describe('PostgresDriver.executeSql', () => {
  it('uses psql with correct connection flags', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.executeSql(exec as unknown as Exec, 'SELECT 1');
    const cmd = calls()[0];
    expect(cmd).toContain('psql');
    expect(cmd).toContain('-hh');
    expect(cmd).toContain('-p5432');
    expect(cmd).toContain('-Uu');
    expect(cmd).toContain('-dpgdb');
  });

  it('sets PGPASSWORD env var', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.executeSql(exec as unknown as Exec, 'SELECT 1');
    expect(calls()[0]).toContain('PGPASSWORD=p@ss');
  });

  it('uses -tA flags for clean output', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.executeSql(exec as unknown as Exec, 'SELECT 1');
    expect(calls()[0]).toContain('-tA');
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

describe('PostgresDriver.dump', () => {
  it('uses pg_dump with correct connection flags and output redirection', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.dump(exec as unknown as Exec, '/tmp/backup.sql');
    const cmd = calls()[0];
    expect(cmd).toContain('pg_dump');
    expect(cmd).toContain('-hh');
    expect(cmd).toContain('-p5432');
    expect(cmd).toContain('-Uu');
    expect(cmd).toContain('pgdb');
    expect(cmd).toContain('>/tmp/backup.sql');
  });

  it('sets PGPASSWORD env var', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.dump(exec as unknown as Exec, '/tmp/backup.sql');
    expect(calls()[0]).toContain('PGPASSWORD=p@ss');
  });

  it('includes -t flags when table list provided', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.dump(exec as unknown as Exec, '/tmp/backup.sql', ['t1', 't2']);
    const cmd = calls()[0];
    expect(cmd).toContain('-t t1');
    expect(cmd).toContain('-t t2');
  });

  it('throws on non-zero exit', async () => {
    const { driver, exec } = driverWith(() => ({ code: 3, stdout: '', stderr: 'denied' }));
    await expect(driver.dump(exec as unknown as Exec, '/tmp/backup.sql')).rejects.toThrow(
      /Backup failed with status code 3: denied/,
    );
  });

  it('rejects unsafe table names before executing', async () => {
    const { driver, exec } = driverWith();
    await expect(
      driver.dump(exec as unknown as Exec, '/tmp/b.sql', ['users; DROP']),
    ).rejects.toThrow(/Invalid SQL identifier for table_name/);
    expect(exec).not.toHaveBeenCalled();
  });

  it('produces -t flags for each valid table name', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.dump(exec as unknown as Exec, '/tmp/b.sql', ['a', 'b']);
    const cmd = calls()[0];
    expect(cmd).toContain('-t a');
    expect(cmd).toContain('-t b');
  });
});

describe('PostgresDriver.restore', () => {
  it('uses psql with input redirection', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.restore(exec as unknown as Exec, '/tmp/backup.sql');
    const cmd = calls()[0];
    expect(cmd).toContain('psql');
    expect(cmd).toContain('</tmp/backup.sql');
  });

  it('sets PGPASSWORD env var', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.restore(exec as unknown as Exec, '/tmp/backup.sql');
    expect(calls()[0]).toContain('PGPASSWORD=p@ss');
  });

  it('throws on non-zero exit', async () => {
    const { driver, exec } = driverWith(() => ({ code: 2, stdout: '', stderr: 'corrupt' }));
    await expect(driver.restore(exec as unknown as Exec, '/tmp/backup.sql')).rejects.toThrow(
      /Restore failed with status code 2: corrupt/,
    );
  });
});

describe('PostgresDriver.listTables', () => {
  it('queries information_schema.tables for public schema', async () => {
    const { driver, exec, calls } = driverWith(() => ({ code: 0, stdout: 'users\norders\n', stderr: '' }));
    const tables = await driver.listTables(exec as unknown as Exec);
    expect(tables).toEqual(['users', 'orders']);
    expect(calls()[0]).toContain("table_schema='public'");
  });
});

describe('PostgresDriver.dropAllTables', () => {
  it('emits DROP SCHEMA public CASCADE; CREATE SCHEMA public', async () => {
    const { driver, exec, calls } = driverWith();
    await driver.dropAllTables(exec as unknown as Exec);
    expect(calls()[0]).toContain('DROP SCHEMA public CASCADE');
    expect(calls()[0]).toContain('CREATE SCHEMA public');
  });
});
