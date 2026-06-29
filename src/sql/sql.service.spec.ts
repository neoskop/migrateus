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
}

function build(execImpl?: (cmd: string) => ExecOutput | Promise<ExecOutput>): Built {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const directusUser = {
    setupUser: jest.fn(async () => undefined) as AnyMock,
    removeUser: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => ({ users: 0, roles: 0, policies: 0 })) as AnyMock,
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

  const service = new SqlService(
    logger as never,
    directusUser as never,
    redact as never,
    transferPlanner as never,
    directus as never,
  );
  service.databaseConfig = {
    host: 'h',
    port: '3306',
    user: 'u',
    password: 'p@ss',
    name: 'mydb',
  } as never;

  return { service, containerService, redact, directusUser, directus, logger, transferPlanner };
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
      cleanUp: jest.fn(async () => ({ users: 0, roles: 0, policies: 0 })) as AnyMock,
      setCredentials: jest.fn(async () => undefined) as AnyMock,
    };
    const service = new SqlService(
      { debug: jest.fn() } as never,
      directusUser as never,
      { addRedaction: jest.fn() } as never,
      { plan: jest.fn() } as never,
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
    const [execInDirectus, getClient, port] = directusUser.setupUser.mock
      .calls[0] as [
      (command: string) => Promise<unknown>,
      (port: number, token: string) => unknown,
      number,
    ];
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

describe('SqlService SQL routing (file vs server engines)', () => {
  it('routes server-engine (mysql) SQL through the sidecar (execute)', async () => {
    const { service, containerService } = build(() => ({ code: 0, stdout: '', stderr: '' }));
    await service.executeSql('SELECT 1', containerService as never);
    expect(containerService.execute).toHaveBeenCalledTimes(1);
    expect(containerService.execInDirectus).not.toHaveBeenCalled();
  });

  it('routes file-engine (sqlite) SQL into the Directus container (execInDirectus)', async () => {
    const { service, containerService } = build();
    service.databaseConfig = {
      client: 'sqlite3',
      filename: '/database/sqlite.db',
      host: '',
      port: '',
      user: '',
      password: '',
      name: '',
    } as never;
    await service.executeSql('SELECT 1', containerService as never);
    expect(containerService.execInDirectus).toHaveBeenCalledTimes(1);
    expect(containerService.execute).not.toHaveBeenCalled();
    // The command targets the Directus DB file via the bundled node module.
    const cmd = containerService.execInDirectus.mock.calls[0][0] as string;
    expect(cmd).toContain('node -e');
    expect(cmd).toContain('/database/sqlite.db');
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
  it('registers redactions (raw, -p-prefixed, and base64) and stores config', () => {
    const { redact } = build();
    expect(redact.addRedaction).toHaveBeenCalledTimes(3);
    expect(redact.addRedaction).toHaveBeenCalledWith('-pp@ss', { prefix: '-p' });
    expect(redact.addRedaction).toHaveBeenCalledWith('p@ss');
    // the base64 form is shipped to the pg sidecar, so it must be redacted too
    expect(redact.addRedaction).toHaveBeenCalledWith(
      Buffer.from('p@ss').toString('base64'),
    );
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

