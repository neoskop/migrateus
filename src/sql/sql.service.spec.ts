import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
} from '@jest/globals';
import { SqlService } from './sql.service.js';

type AnyMock = jest.Mock<any>;

interface ExecOutput {
  code: number;
  stdout: string;
  stderr: string;
}

interface Built {
  service: SqlService;
  containerService: { execute: AnyMock; execInDirectus: AnyMock };
  redact: { addRedaction: AnyMock };
  directusUser: {
    setupUser: AnyMock;
    removeUser: AnyMock;
    cleanUp: AnyMock;
    setCredentials: AnyMock;
  };
  directus: { getClient: AnyMock };
  logger: { debug: AnyMock };
  transferPlanner: { plan: AnyMock };
  pgloaderService: { run: AnyMock };
}

function build(execImpl?: (cmd: string) => ExecOutput | Promise<ExecOutput>): Built {
  const logger = { debug: jest.fn() };
  const directusUser = {
    setupUser: jest.fn(async () => undefined) as AnyMock,
    removeUser: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
    setCredentials: jest.fn(async () => undefined) as AnyMock,
  };
  const directus = {
    getClient: jest.fn(() => ({ request: jest.fn() })) as AnyMock,
  };
  const redact = { addRedaction: jest.fn() };
  const containerService = {
    execute: jest.fn(async (cmd: string) =>
      execImpl
        ? await execImpl(cmd)
        : ({ code: 0, stdout: '', stderr: '' } satisfies ExecOutput),
    ) as AnyMock,
    execInDirectus: jest.fn(async () =>
      ({ code: 0, stdout: '', stderr: '' } satisfies ExecOutput),
    ) as AnyMock,
  };
  const transferPlanner = { plan: jest.fn().mockReturnValue({ mode: 'native' }) as AnyMock };
  const pgloaderService = { run: jest.fn(async () => undefined) as AnyMock };

  const service = new SqlService(
    logger as never,
    directusUser as never,
    redact as never,
    transferPlanner as never,
    pgloaderService as never,
    directus as never,
  );
  service.databaseConfig = {
    host: 'h',
    port: '3306',
    user: 'u',
    password: 'p@ss',
    name: 'mydb',
  } as never;

  return { service, containerService, redact, directusUser, directus, logger, transferPlanner, pgloaderService };
}

describe('SqlService.client getter', () => {
  it('returns "mysql" when databaseConfig has no explicit client (default)', () => {
    const { service } = build();
    expect(service.client).toBe('mysql');
  });
});

describe('SqlService.usesSidecar getter', () => {
  it('returns true for the default mysql config', () => {
    const { service } = build();
    expect(service.usesSidecar).toBe(true);
  });

  it('returns false when databaseConfig is sqlite3', () => {
    const { service } = build();
    service.databaseConfig = {
      client: 'sqlite3',
      filename: '/x.db',
      host: '',
      port: '',
      user: '',
      password: '',
      name: '',
    } as never;
    expect(service.usesSidecar).toBe(false);
  });
});

describe('SqlService cleanup guards (no driver / setup failed)', () => {
  it('cleanUpDirectusUser is a no-op when databaseConfig was never set', async () => {
    const directusUser = {
      setupUser: jest.fn(async () => undefined) as AnyMock,
      removeUser: jest.fn(async () => undefined) as AnyMock,
      cleanUp: jest.fn(async () => undefined) as AnyMock,
      setCredentials: jest.fn(async () => undefined) as AnyMock,
    };
    const service = new SqlService(
      { debug: jest.fn() } as never,
      directusUser as never,
      { addRedaction: jest.fn() } as never,
      { plan: jest.fn() } as never,
      { run: jest.fn() } as never,
      { getClient: jest.fn() } as never,
    );
    // cleanUpDirectusUser delegates to removeUser, which self-guards when the
    // temp admin was never created (setup failed) — so this is a safe no-op.
    await expect(service.cleanUpDirectusUser()).resolves.toBeUndefined();
  });
});

describe('SqlService.setupDirectusUser (CLI temp-admin wiring)', () => {
  it('delegates to directusUserService.setupUser with execInDirectus, getClient and port', async () => {
    const { service, containerService, directusUser, directus } = build();

    await service.setupDirectusUser(containerService as never, 9001);

    expect(directusUser.setupUser).toHaveBeenCalledTimes(1);
    const [execInDirectus, getClient, port] =
      directusUser.setupUser.mock.calls[0];
    expect(typeof execInDirectus).toBe('function');
    expect(typeof getClient).toBe('function');
    expect(port).toBe(9001);

    // The passed execInDirectus delegates to the container's execInDirectus.
    await execInDirectus('node /directus/cli.js roles create --role r --admin');
    expect(containerService.execInDirectus).toHaveBeenCalledWith(
      'node /directus/cli.js roles create --role r --admin',
    );

    // The passed getClient delegates to DirectusService.getClient.
    getClient(9001, 'tok');
    expect(directus.getClient).toHaveBeenCalledWith(9001, 'tok');
  });
});

describe('SqlService.cleanUpDirectusUser', () => {
  it('delegates to directusUserService.removeUser', async () => {
    const { service, directusUser } = build();
    await service.cleanUpDirectusUser();
    expect(directusUser.removeUser).toHaveBeenCalledTimes(1);
  });
});

describe('SqlService.cleanUpAllDirectusUsers (SQL sweep, unchanged)', () => {
  it('delegates to directusUserService.cleanUp with the driver and an exec', async () => {
    const { service, containerService, directusUser } = build();
    await service.cleanUpAllDirectusUsers(containerService as never);
    expect(directusUser.cleanUp).toHaveBeenCalledTimes(1);
  });
});

describe('SqlService.clientImage getter', () => {
  it('returns the bundled image for client pg', () => {
    const { service } = build();
    service.databaseConfig = {
      client: 'pg',
      host: 'h',
      port: '5432',
      user: 'u',
      password: 'p',
      name: 'mydb',
    } as never;
    expect(service.clientImage).toBe('neoskop/migrateus:latest');
  });

  it('returns the bundled image for client mysql', () => {
    const { service } = build();
    // already set to mysql in build()
    expect(service.clientImage).toBe('neoskop/migrateus:latest');
  });

  it('returns the bundled image for client sqlite3', () => {
    const { service } = build();
    service.databaseConfig = {
      client: 'sqlite3',
      host: 'localhost',
      port: '0',
      user: '',
      password: '',
      name: 'mydb.sqlite',
    } as never;
    expect(service.clientImage).toBe('neoskop/migrateus:latest');
  });
});

describe('SqlService.databaseConfig setter', () => {
  it('registers two redactions and stores config', () => {
    const { redact } = build();
    expect(redact.addRedaction).toHaveBeenCalledTimes(2);
    expect(redact.addRedaction).toHaveBeenCalledWith('-pp@ss', { prefix: '-p' });
    expect(redact.addRedaction).toHaveBeenCalledWith('p@ss');
  });
});

describe('SqlService.setAssetStorage', () => {
  it('emits no SQL for empty storage', async () => {
    const { service, containerService } = build();
    await service.setAssetStorage('', containerService as never);
    await service.setAssetStorage(undefined as never, containerService as never);
    expect(containerService.execute).not.toHaveBeenCalled();
  });

  it('emits an UPDATE with the storage value escaped', async () => {
    const { service, containerService } = build();
    await service.setAssetStorage('local', containerService as never);
    expect(containerService.execute).toHaveBeenCalledTimes(1);
    const cmd = containerService.execute.mock.calls[0][0] as string;
    expect(cmd).toContain("UPDATE directus_files SET storage = 'local'");
    expect(cmd).toContain("storage <> 'local'");
  });
});

describe('SqlService pass-throughs to the driver', () => {
  it('escapeIdentifier delegates to the active driver', () => {
    const { service } = build();
    // MySQL driver wraps identifiers in backticks
    expect(service.escapeIdentifier('my_table')).toBe('`my_table`');
  });

  it('escapeString delegates to the active driver', () => {
    const { service } = build();
    // MySQL driver wraps strings in single quotes
    expect(service.escapeString('hello')).toBe("'hello'");
  });

  it('disableForeignKeys delegates to the active driver', () => {
    const { service } = build();
    // MySQL driver emits SET foreign_key_checks = 0
    expect(service.disableForeignKeys()).toBe('SET foreign_key_checks = 0');
  });

  it('enableForeignKeys delegates to the active driver', () => {
    const { service } = build();
    // MySQL driver emits SET foreign_key_checks = 1
    expect(service.enableForeignKeys()).toBe('SET foreign_key_checks = 1');
  });
});

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

describe('SqlService.dropAllTables', () => {
  it('delegates to driver.dropAllTables via execFor', async () => {
    const { service, containerService } = build();
    await service.dropAllTables(containerService as never);
    // MySQL dropAllTables runs multiple queries; at minimum the execute was called
    expect(containerService.execute).toHaveBeenCalled();
  });
});

describe('SqlService.transferRestore (native path)', () => {
  it('calls driver.restore and driver.postRestoreFixups when TransferPlanner returns native', async () => {
    const { service, containerService, transferPlanner } = build((cmd) =>
      cmd.includes('DEFAULT_COLLATION_NAME')
        ? { code: 0, stdout: 'utf8mb4_unicode_ci\n', stderr: '' }
        : cmd.includes('default_character_set_name')
          ? { code: 0, stdout: 'utf8mb4\n', stderr: '' }
          : cmd.includes('TABLE_TYPE')
            ? { code: 0, stdout: 't1\n', stderr: '' }
            : { code: 0, stdout: '', stderr: '' },
    );
    transferPlanner.plan.mockReturnValue({ mode: 'native' });

    await service.transferRestore(containerService as never, 'mysql', '/tmp/backup.sql');

    expect(transferPlanner.plan).toHaveBeenCalledWith('mysql', 'mysql');
    const cmds = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    // restore command uses mysql CLI with the backup file
    expect(cmds.some((c) => c.includes('/tmp/backup.sql'))).toBe(true);
    // postRestoreFixups emits charset conversion
    expect(cmds.some((c) => c.includes('CONVERT TO CHARACTER SET utf8mb4'))).toBe(true);
  });

  it('honors the sqliteArtifact parameter in the native path (not hardcoded /tmp/backup.sql)', async () => {
    const { service, containerService, transferPlanner } = build((cmd) =>
      cmd.includes('DEFAULT_COLLATION_NAME')
        ? { code: 0, stdout: 'utf8mb4_unicode_ci\n', stderr: '' }
        : cmd.includes('default_character_set_name')
          ? { code: 0, stdout: 'utf8mb4\n', stderr: '' }
          : cmd.includes('TABLE_TYPE')
            ? { code: 0, stdout: 't1\n', stderr: '' }
            : { code: 0, stdout: '', stderr: '' },
    );
    transferPlanner.plan.mockReturnValue({ mode: 'native' });

    // Pass a custom artifact path that differs from the old hardcoded value
    await service.transferRestore(containerService as never, 'mysql', '/custom/path/dump.sql');

    const cmds = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    // The custom artifact path must appear in the restore command
    expect(cmds.some((c) => c.includes('/custom/path/dump.sql'))).toBe(true);
    // The old hardcoded path must NOT appear
    expect(cmds.some((c) => c.includes('/tmp/backup.sql'))).toBe(false);
  });
});

describe('SqlService.databaseFilename getter', () => {
  it('returns filename when set explicitly on a sqlite3 config', () => {
    const { service } = build();
    service.databaseConfig = {
      client: 'sqlite3',
      filename: '/data/mydb.sqlite',
      host: '',
      port: '',
      user: '',
      password: '',
      name: 'mydb',
    } as never;
    expect(service.databaseFilename).toBe('/data/mydb.sqlite');
  });

  it('falls back to name when filename is absent', () => {
    const { service } = build();
    service.databaseConfig = {
      client: 'sqlite3',
      host: '',
      port: '',
      user: '',
      password: '',
      name: 'mydb.sqlite',
    } as never;
    expect(service.databaseFilename).toBe('mydb.sqlite');
  });
});

describe('SqlService.transferRestore (pgloader path)', () => {
  // After pgloader, transferRestore verifies tables exist via the driver's
  // listTables (an information_schema query). Return a table so it passes.
  const withTables = (cmd: string) =>
    cmd.includes('information_schema')
      ? { code: 0, stdout: 'directus_collections\n', stderr: '' }
      : { code: 0, stdout: '', stderr: '' };

  it('calls pgloaderService.run with stored config when TransferPlanner returns pgloader', async () => {
    const { service, containerService, transferPlanner, pgloaderService } =
      build(withTables);

    // Override to a pg-target driver
    service.databaseConfig = {
      client: 'pg',
      host: 'pghost',
      port: '5432',
      user: 'pguser',
      password: 'pgpass',
      name: 'pgdb',
    } as never;
    transferPlanner.plan.mockReturnValue({ mode: 'pgloader' });

    await service.transferRestore(containerService as never, 'sqlite3', '/tmp/backup.sqlite');

    expect(transferPlanner.plan).toHaveBeenCalledWith('sqlite3', 'pg');
    expect(pgloaderService.run).toHaveBeenCalledWith({
      containerService,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: {
        host: 'pghost',
        port: '5432',
        user: 'pguser',
        password: 'pgpass',
        name: 'pgdb',
      },
    });
  });

  it('throws a clear error when pgloader creates no tables (listTables empty)', async () => {
    // execute returns no rows for the information_schema query → 0 tables.
    const { service, containerService, transferPlanner } = build(() => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));

    service.databaseConfig = {
      client: 'pg',
      host: 'pghost',
      port: '5432',
      user: 'pguser',
      password: 'pgpass',
      name: 'pgdb',
    } as never;
    transferPlanner.plan.mockReturnValue({ mode: 'pgloader' });

    await expect(
      service.transferRestore(containerService as never, 'sqlite3', '/tmp/backup.sqlite'),
    ).rejects.toThrow(/created no tables/);
  });
});
