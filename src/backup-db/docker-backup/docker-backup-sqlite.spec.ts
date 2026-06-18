// Tests for DockerBackupService.copyDatabaseOut — the SQLite file-copy path.
// Mocks dockerContainerService.copyFromDirectus and dockerService storage getters.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DockerBackupService } from './docker-backup.service.js';

type AnyMock = jest.Mock<any>;

function buildDockerBackupService(overrides?: {
  directusStorageIsLocal?: boolean;
  directusStorageRoot?: string;
  databaseFilename?: string;
}) {
  const copyFromDirectus = jest.fn(async () => undefined) as AnyMock;

  const dockerContainerService = {
    copyFromDirectus,
    setup: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
    image: '',
    mount: undefined as string | undefined,
  };

  const dockerService = {
    setup: jest.fn(async () => undefined) as AnyMock,
    directusStorageIsLocal: overrides?.directusStorageIsLocal ?? true,
    directusStorageRoot: overrides?.directusStorageRoot ?? '/directus/uploads',
    containerConfig: {
      Config: { Image: 'directus/directus:11.16.1', Env: [] },
      State: { Running: true },
      NetworkSettings: { Networks: [] },
      Id: 'abc123',
    },
  };

  const sqlService = {
    client: 'sqlite3' as const,
    clientImage: 'neoskop/migrateus:latest',
    usesSidecar: false,
    databaseFilename: overrides?.databaseFilename ?? '/database/sqlite.db',
    performMysqlDump: jest.fn(async () => undefined) as AnyMock,
    setupDirectusUser: jest.fn(async () => undefined) as AnyMock,
    cleanUpDirectusUser: jest.fn(async () => undefined) as AnyMock,
  };

  const progressService = {
    advance: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    finish: jest.fn(),
    updateText: jest.fn(),
    warn: jest.fn(),
  } as never;

  const directusVersionService = {
    getVersion: jest.fn(async () => '11.16.1') as AnyMock,
  } as never;

  const directusAssetService = {} as never;
  const config = { noAssets: true } as never;
  const logger = { debug: jest.fn() };

  const service = new DockerBackupService(
    logger as never,
    sqlService as never,
    directusAssetService,
    dockerContainerService as never,
    dockerService as never,
    config,
    progressService,
    directusVersionService,
  );

  return { service, dockerContainerService, dockerService, copyFromDirectus };
}

describe('DockerBackupService.copyDatabaseOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies the SQLite database file from the Directus container', async () => {
    const { service, copyFromDirectus } = buildDockerBackupService();

    await (service as any).copyDatabaseOut('/tmp/backupdir');

    expect(copyFromDirectus).toHaveBeenCalledWith(
      '/database/sqlite.db',
      '/tmp/backupdir/database.sqlite',
    );
  });

  it('attempts to copy the WAL sidecar file (swallows errors)', async () => {
    const { service, copyFromDirectus } = buildDockerBackupService();
    // Make WAL copy fail — should not throw
    copyFromDirectus.mockImplementation(async (src: string) => {
      if (src.endsWith('-wal')) throw new Error('WAL not found');
      return undefined;
    });

    await expect((service as any).copyDatabaseOut('/tmp/backupdir')).resolves.not.toThrow();

    const walCall = copyFromDirectus.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).endsWith('-wal'),
    );
    expect(walCall).toBeDefined();
  });

  it('attempts to copy the SHM sidecar file (swallows errors)', async () => {
    const { service, copyFromDirectus } = buildDockerBackupService();
    copyFromDirectus.mockImplementation(async (src: string) => {
      if (src.endsWith('-shm')) throw new Error('SHM not found');
      return undefined;
    });

    await expect((service as any).copyDatabaseOut('/tmp/backupdir')).resolves.not.toThrow();

    const shmCall = copyFromDirectus.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).endsWith('-shm'),
    );
    expect(shmCall).toBeDefined();
  });

  it('copies the uploads directory when directusStorageIsLocal is true', async () => {
    const { service, copyFromDirectus } = buildDockerBackupService({
      directusStorageIsLocal: true,
      directusStorageRoot: '/directus/uploads',
    });

    await (service as any).copyDatabaseOut('/tmp/backupdir');

    expect(copyFromDirectus).toHaveBeenCalledWith(
      '/directus/uploads',
      '/tmp/backupdir/uploads',
    );
  });

  it('skips the uploads directory when directusStorageIsLocal is false', async () => {
    const { service, copyFromDirectus } = buildDockerBackupService({
      directusStorageIsLocal: false,
      directusStorageRoot: 's3://bucket/uploads',
    });

    await (service as any).copyDatabaseOut('/tmp/backupdir');

    // copyFromDirectus should only be called for the db file and sidecars, not uploads
    const uploadCall = copyFromDirectus.mock.calls.find(
      (c: unknown[]) => typeof c[1] === 'string' && (c[1] as string).endsWith('/uploads'),
    );
    expect(uploadCall).toBeUndefined();
  });

  it('does not set dockerContainerService.mount (no sidecar)', async () => {
    const { service, dockerContainerService } = buildDockerBackupService();

    await (service as any).copyDatabaseOut('/tmp/backupdir');

    expect(dockerContainerService.mount).toBeUndefined();
  });
});

describe('DockerBackupService.getDirectusVersionHint', () => {
  it('parses the image tag from containerConfig.Config.Image', () => {
    const { service } = buildDockerBackupService();

    const hint = (service as any).getDirectusVersionHint();

    expect(hint).toBe('11.16.1');
  });

  it('returns undefined when Image is not set', () => {
    const { service, dockerService } = buildDockerBackupService();
    dockerService.containerConfig.Config.Image = undefined as any;

    const hint = (service as any).getDirectusVersionHint();

    expect(hint).toBeUndefined();
  });

  it('returns undefined when Image has no colon (no tag)', () => {
    const { service, dockerService } = buildDockerBackupService();
    dockerService.containerConfig.Config.Image = 'directusdirectus' as any;

    const hint = (service as any).getDirectusVersionHint();

    expect(hint).toBeUndefined();
  });
});
