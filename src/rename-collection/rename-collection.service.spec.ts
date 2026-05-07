import {
  describe,
  it,
  expect,
  beforeEach,
  jest,
} from '@jest/globals';
import { RenameCollectionService } from './rename-collection.service.js';

type AnyMock = jest.Mock<any>;

interface Mocks {
  logger: { debug: AnyMock; info: AnyMock; warn: AnyMock; error: AnyMock };
  config: { getEnvironment: AnyMock };
  environmentService: { environment: unknown };
  containerServices: Record<string, unknown>;
  progressService: { advance: AnyMock; finish: AnyMock; fail: AnyMock };
  sqlService: { listTables: AnyMock; executeSql: AnyMock };
  k8sService: { setup: AnyMock };
  dockerService: { setup: AnyMock };
  containerStub: { cleanUp: AnyMock };
}

function build(): { service: RenameCollectionService; mocks: Mocks } {
  const containerStub = { cleanUp: jest.fn(async () => undefined) as AnyMock };
  const mocks: Mocks = {
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    config: {
      getEnvironment: jest.fn(() => ({ platform: 'k8s' })) as AnyMock,
    },
    environmentService: { environment: undefined },
    containerServices: { dev: containerStub },
    progressService: {
      advance: jest.fn(),
      finish: jest.fn(),
      fail: jest.fn(),
    },
    sqlService: {
      listTables: jest.fn(async () => []) as AnyMock,
      executeSql: jest.fn(async () => '') as AnyMock,
    },
    k8sService: { setup: jest.fn(async () => undefined) as AnyMock },
    dockerService: { setup: jest.fn(async () => undefined) as AnyMock },
    containerStub,
  };

  const service = new RenameCollectionService(
    mocks.logger as never,
    mocks.config as never,
    mocks.environmentService as never,
    mocks.containerServices as never,
    mocks.progressService as never,
    mocks.sqlService as never,
    mocks.k8sService as never,
    mocks.dockerService as never,
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

  it('emits ALTER TABLE with backtick-escaped identifiers when table exists', async () => {
    const { service, mocks } = built;
    mocks.sqlService.listTables.mockResolvedValueOnce(['old_table']);

    await service.renameCollection('dev', 'old_table', 'new_table');

    const calls = mocks.sqlService.executeSql.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0][0]).toBe(
      'ALTER TABLE `old_table` RENAME TO `new_table`;',
    );
    const updateBatch = calls[1][0] as string;
    expect(updateBatch).toContain("'old_table'");
    expect(updateBatch).toContain("'new_table'");
    expect(updateBatch).toContain('SET foreign_key_checks = 0;');
    expect(updateBatch).toContain('SET foreign_key_checks = 1;');
    expect(updateBatch).toContain(
      "UPDATE directus_collections SET collection = 'new_table' WHERE collection = 'old_table';",
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
