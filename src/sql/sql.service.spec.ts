import {
  describe,
  it,
  expect,
  jest,
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
  containerService: { execute: AnyMock };
  redact: { addRedaction: AnyMock };
  directusUser: {
    setupUser: AnyMock;
    removeUser: AnyMock;
    cleanUp: AnyMock;
    setCredentials: AnyMock;
  };
  logger: { debug: AnyMock };
}

function build(execImpl?: (cmd: string) => ExecOutput | Promise<ExecOutput>): Built {
  const logger = { debug: jest.fn() };
  const directusUser = {
    setupUser: jest.fn(async () => undefined) as AnyMock,
    removeUser: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
    setCredentials: jest.fn(async () => undefined) as AnyMock,
  };
  const redact = { addRedaction: jest.fn() };
  const containerService = {
    execute: jest.fn(async (cmd: string) =>
      execImpl
        ? await execImpl(cmd)
        : ({ code: 0, stdout: '', stderr: '' } satisfies ExecOutput),
    ) as AnyMock,
  };

  const service = new SqlService(
    logger as never,
    directusUser as never,
    redact as never,
  );
  service.databaseConfig = {
    host: 'h',
    port: 3306,
    user: 'u',
    password: 'p@ss',
    name: 'mydb',
  } as never;

  return { service, containerService, redact, directusUser, logger };
}

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
