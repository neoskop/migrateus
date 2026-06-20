import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RenameCollectionService } from './rename-collection.service.js';

type AnyMock = jest.Mock<any>;

function build(platform = 'k8s') {
  const containerStub = {
    setup: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
  };
  const fakePlatform = {
    containerService: containerStub,
    setup: jest.fn(async () => undefined) as AnyMock,
    teardown: jest.fn(async () => undefined) as AnyMock,
  };
  const platformResolver = {
    resolve: jest.fn(() => fakePlatform) as AnyMock,
  };
  const mocks = {
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    config: {
      getEnvironment: jest.fn(() => ({ platform })) as AnyMock,
    },
    environmentService: { environment: undefined },
    progressService: {
      advance: jest.fn(),
      finish: jest.fn(),
      fail: jest.fn(),
    },
    sqlService: {
      listTables: jest.fn(async () => []) as AnyMock,
      executeSql: jest.fn(async () => '') as AnyMock,
      // Mock with portable/Postgres-style quoting so assertions are driver-neutral
      escapeIdentifier: jest.fn((id: string) => `"${id}"`) as AnyMock,
      escapeString: jest.fn((v: string) => `'${v}'`) as AnyMock,
      disableForeignKeys: jest.fn(
        () => 'SET session_replication_role = replica',
      ) as AnyMock,
      enableForeignKeys: jest.fn(
        () => 'SET session_replication_role = origin',
      ) as AnyMock,
    },
    platformResolver,
    fakePlatform,
    containerStub,
  };

  const service = new RenameCollectionService(
    mocks.logger as never,
    mocks.config as never,
    mocks.environmentService as never,
    mocks.progressService as never,
    mocks.sqlService as never,
    mocks.platformResolver as never,
  );

  return { service, mocks };
}

describe('RenameCollectionService.renameCollection', () => {
  let built: ReturnType<typeof build>;

  beforeEach(() => {
    built = build();
  });

  it('rejects an unsafe oldName before issuing any SQL', async () => {
    const { service, mocks } = built;
    await expect(
      service.renameCollection('dev', 'users; DROP TABLE x', 'safe'),
    ).rejects.toThrow(/Invalid SQL identifier for oldName/);
    expect(mocks.sqlService.executeSql).not.toHaveBeenCalled();
    expect(mocks.containerStub.cleanUp).not.toHaveBeenCalled();
  });

  it('rejects an unsafe newName before issuing any SQL', async () => {
    const { service, mocks } = built;
    await expect(
      service.renameCollection('dev', 'safe', "x'; DROP"),
    ).rejects.toThrow(/Invalid SQL identifier for newName/);
    expect(mocks.sqlService.executeSql).not.toHaveBeenCalled();
  });

  it('emits ALTER TABLE using escapeIdentifier from the driver when table exists', async () => {
    const { service, mocks } = built;
    mocks.sqlService.listTables.mockResolvedValueOnce(['old_table']);

    await service.renameCollection('dev', 'old_table', 'new_table');

    const calls = mocks.sqlService.executeSql.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // ALTER TABLE statement uses driver-provided identifier quoting
    expect(calls[0][0]).toBe('ALTER TABLE "old_table" RENAME TO "new_table";');
  });

  it('emits fk-toggle SQL via driver helpers (not literal foreign_key_checks)', async () => {
    const { service, mocks } = built;
    mocks.sqlService.listTables.mockResolvedValueOnce(['old_table']);

    await service.renameCollection('dev', 'old_table', 'new_table');

    const calls = mocks.sqlService.executeSql.mock.calls;
    const updateBatch = calls[1][0] as string;

    // Must use the driver's fk helpers, not MySQL-specific literals
    expect(updateBatch).toContain('SET session_replication_role = replica;');
    expect(updateBatch).toContain('SET session_replication_role = origin;');
    expect(updateBatch).not.toContain('foreign_key_checks');
  });

  it('emits UPDATE directus_collections group using escapeIdentifier for column name', async () => {
    const { service, mocks } = built;
    mocks.sqlService.listTables.mockResolvedValueOnce(['old_table']);

    await service.renameCollection('dev', 'old_table', 'new_table');

    const calls = mocks.sqlService.executeSql.mock.calls;
    const updateBatch = calls[1][0] as string;

    // The group column must be quoted via escapeIdentifier (no table alias)
    expect(updateBatch).toContain(
      `UPDATE directus_collections SET "group" = 'new_table' WHERE "group" = 'old_table';`,
    );
  });

  it('emits UPDATE directus_collections collection using escaped string literals', async () => {
    const { service, mocks } = built;
    mocks.sqlService.listTables.mockResolvedValueOnce(['old_table']);

    await service.renameCollection('dev', 'old_table', 'new_table');

    const updateBatch = mocks.sqlService.executeSql.mock.calls[1][0] as string;
    expect(updateBatch).toContain(
      `UPDATE directus_collections SET collection = 'new_table' WHERE collection = 'old_table';`,
    );
  });

  it('skips ALTER TABLE when the source table is not present', async () => {
    const { service, mocks } = built;
    mocks.sqlService.listTables.mockResolvedValueOnce(['unrelated']);

    await service.renameCollection('dev', 'missing', 'arrived');

    const sqls = mocks.sqlService.executeSql.mock.calls.map(
      (c: any[]) => c[0] as string,
    );
    expect(sqls.some((s) => s.startsWith('ALTER TABLE'))).toBe(false);
    expect(sqls.length).toBe(1);
  });

  it('reports failure to progressService and still cleans up the container', async () => {
    const { service, mocks } = built;
    mocks.sqlService.listTables.mockResolvedValueOnce(['t']);
    const boom = new Error('boom');
    mocks.sqlService.executeSql.mockRejectedValueOnce(boom);

    await service.renameCollection('dev', 't', 'u');

    expect(mocks.progressService.fail).toHaveBeenCalledWith(boom);
    expect(mocks.containerStub.cleanUp).toHaveBeenCalledTimes(1);
  });
});

describe('RenameCollectionService — platform setup', () => {
  it('resolves the platform for the environment and sets up its container', async () => {
    const { service, mocks } = build('aca');
    mocks.sqlService.listTables.mockResolvedValueOnce([]);

    await service.renameCollection('aca-env', 'old_col', 'new_col');

    expect(mocks.platformResolver.resolve).toHaveBeenCalledWith('aca');
    expect(mocks.fakePlatform.setup).toHaveBeenCalledTimes(1);
    expect(mocks.containerStub.setup).toHaveBeenCalledTimes(1);
  });
});
