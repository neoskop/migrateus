import {
  describe,
  it,
  expect,
  beforeEach,
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

describe('SqlService.executeSql', () => {
  it('throws when exit code is non-zero, including stderr', async () => {
    const { service, containerService } = build(() => ({
      code: 1,
      stdout: '',
      stderr: 'boom',
    }));
    await expect(
      service.executeSql('SELECT 1', containerService as never),
    ).rejects.toThrow(/Execution of SQL failed with status code 1: boom/);
  });

  it('escapes $ characters in the wire command (regression)', async () => {
    const { service, containerService } = build();
    await service.executeSql("SELECT '$x' FROM t", containerService as never);
    const cmd = containerService.execute.mock.calls[0][0] as string;
    expect(cmd).toContain('\\\\\\$x');
    expect(cmd).not.toMatch(/[^\\]\$x/);
  });

  it('returns stdout on success', async () => {
    const { service, containerService } = build(() => ({
      code: 0,
      stdout: 'hello\n',
      stderr: '',
    }));
    const out = await service.executeSql(
      'SELECT 1',
      containerService as never,
    );
    expect(out).toBe('hello\n');
  });
});

describe('SqlService.listTables', () => {
  it('drops the header row and trims blank lines', async () => {
    const { service, containerService } = build(() => ({
      code: 0,
      stdout: 'table_name\nfoo\nbar\n',
      stderr: '',
    }));
    const tables = await service.listTables(containerService as never);
    expect(tables).toEqual(['foo', 'bar']);
  });
});

describe('SqlService.restoreMysqlDump', () => {
  function execScript(replies: string[]) {
    let i = 0;
    return (cmd: string) => {
      if (cmd.startsWith('mysql ') && !cmd.includes(' -e ')) {
        return { code: 0, stdout: '', stderr: '' };
      }
      const stdout = replies[i] ?? '';
      i += 1;
      return { code: 0, stdout, stderr: '' };
    };
  }

  it('issues ALTER TABLE per table with safe charset/collation', async () => {
    const { service, containerService } = build(
      execScript([
        'DEFAULT_COLLATION_NAME\nutf8mb4_unicode_ci\n',
        'default_character_set_name\nutf8mb4\n',
        'table_name\nt1\nt2\n',
        '',
      ]),
    );

    await service.restoreMysqlDump(containerService as never);

    const cmds = containerService.execute.mock.calls.map(
      (c: any[]) => c[0] as string,
    );
    const alterCmd = cmds.find((c) => c.includes('ALTER TABLE')) ?? '';
    expect(alterCmd).toContain('SET foreign_key_checks = 0;');
    expect(alterCmd).toContain(
      'ALTER TABLE `t1` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    expect(alterCmd).toContain(
      'ALTER TABLE `t2` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    expect(alterCmd).toContain('SET foreign_key_checks = 1');
  });

  it('rejects when the schema returns a malicious collation', async () => {
    const { service, containerService } = build(
      execScript([
        'DEFAULT_COLLATION_NAME\nutf8mb4; DROP DATABASE foo\n',
      ]),
    );
    await expect(
      service.restoreMysqlDump(containerService as never),
    ).rejects.toThrow(/Invalid charset\/collation for default collation/);
  });

  it('rejects when a returned table_name is not a safe identifier', async () => {
    const { service, containerService } = build(
      execScript([
        'DEFAULT_COLLATION_NAME\nutf8mb4_unicode_ci\n',
        'default_character_set_name\nutf8mb4\n',
        'table_name\nusers; DROP\n',
      ]),
    );
    await expect(
      service.restoreMysqlDump(containerService as never),
    ).rejects.toThrow(/Invalid SQL identifier for table_name/);
  });

  it('throws if the mysql restore itself fails (non-zero exit)', async () => {
    const { service, containerService } = build((cmd) =>
      cmd.startsWith('mysql ') && !cmd.includes(' -e ')
        ? { code: 2, stdout: '', stderr: 'corrupt' }
        : { code: 0, stdout: '', stderr: '' },
    );
    await expect(
      service.restoreMysqlDump(containerService as never),
    ).rejects.toThrow(/Restore failed with status code 2: corrupt/);
  });
});

describe('SqlService.performMysqlDump', () => {
  it('throws when mysqldump exits non-zero', async () => {
    const { service, containerService } = build(() => ({
      code: 3,
      stdout: '',
      stderr: 'denied',
    }));
    await expect(
      service.performMysqlDump(containerService as never),
    ).rejects.toThrow(/Backup failed with status code 3: denied/);
  });

  it('appends the joined table list when provided', async () => {
    const { service, containerService } = build();
    await service.performMysqlDump(containerService as never, ['a', 'b']);
    const cmd = containerService.execute.mock.calls[0][0] as string;
    expect(cmd).toContain(' mydb a b ');
  });
});
