// Tests for DockerRestoreService.copyDatabaseIn — the SQLite file-copy restore path.
// Mocks dockerContainerService.copyToDirectus and dockerService storage getters.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DockerRestoreService } from './docker-restore.service.js';

type AnyMock = jest.Mock<any>;

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dr-sqlite-test-'));
}

function buildDockerRestoreService(overrides?: {
  directusStorageIsLocal?: boolean;
  directusStorageRoot?: string;
  databaseFilename?: string;
  noFilename?: boolean;
}) {
  const copyToDirectus = jest.fn(async () => undefined) as AnyMock;

  const dockerContainerService = {
    copyToDirectus,
    setup: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
    execute: jest.fn(async () => ({ code: 0, stdout: '', stderr: '' })) as AnyMock,
    image: '',
    mount: undefined as string | undefined,
  };

  const dockerService = {
    setup: jest.fn(async () => undefined) as AnyMock,
    restartDirectus: jest.fn(async () => undefined) as AnyMock,
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
    databaseFilename: overrides?.noFilename ? undefined : (overrides?.databaseFilename ?? '/database/sqlite.db'),
    dropAllTables: jest.fn(async () => undefined) as AnyMock,
    transferRestore: jest.fn(async () => undefined) as AnyMock,
    setupDirectusUser: jest.fn(async () => undefined) as AnyMock,
    cleanUpDirectusUser: jest.fn(async () => undefined) as AnyMock,
    setCredentials: jest.fn(async () => undefined) as AnyMock,
    setAssetStorage: jest.fn(async () => undefined) as AnyMock,
  };

  const progressService = {
    advance: jest.fn(),
    warn: jest.fn(),
    fail: jest.fn(),
    finish: jest.fn(),
    updateText: jest.fn(),
  } as never;

  const directusAssetService = {
    restoreAssets: jest.fn(async () => 0) as AnyMock,
  } as never;

  const directusSettingService = {
    updateSettings: jest.fn(async () => undefined) as AnyMock,
  } as never;

  const directusVersionService = {
    getVersion: jest.fn(async () => '11.16.1') as AnyMock,
    isDangerousMismatch: jest.fn(() => false) as AnyMock,
  } as never;

  const environmentService = {
    environment: {
      credentials: [],
      assetStorage: undefined as string | undefined,
      settings: undefined as any,
    },
  };

  const configService = {
    force: true,
  };

  const logger = { debug: jest.fn(), warn: jest.fn() };

  const service = new DockerRestoreService(
    logger as never,
    sqlService as never,
    directusAssetService,
    directusSettingService,
    dockerContainerService as never,
    dockerService as never,
    environmentService as never,
    progressService,
    directusVersionService,
    configService as never,
  );

  return { service, dockerContainerService, dockerService, copyToDirectus, sqlService };
}

describe('DockerRestoreService.copyDatabaseIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies database.sqlite to the databaseFilename path in the container', async () => {
    const { service, copyToDirectus } = buildDockerRestoreService();
    const tmpDir = makeTempDir();
    try {
      // Create the sqlite file so it exists locally
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite content');

      await (service as any).copyDatabaseIn(tmpDir);

      expect(copyToDirectus).toHaveBeenCalledWith(
        `${tmpDir}/database.sqlite`,
        '/database/sqlite.db',
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('copies WAL sidecar when it exists locally', async () => {
    const { service, copyToDirectus } = buildDockerRestoreService();
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite');
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite-wal'), 'fake wal');

      await (service as any).copyDatabaseIn(tmpDir);

      const walCall = copyToDirectus.mock.calls.find(
        (c: unknown[]) => typeof c[1] === 'string' && (c[1] as string).endsWith('-wal'),
      );
      expect(walCall).toBeDefined();
      expect(walCall![0]).toBe(`${tmpDir}/database.sqlite-wal`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('copies SHM sidecar when it exists locally', async () => {
    const { service, copyToDirectus } = buildDockerRestoreService();
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite');
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite-shm'), 'fake shm');

      await (service as any).copyDatabaseIn(tmpDir);

      const shmCall = copyToDirectus.mock.calls.find(
        (c: unknown[]) => typeof c[1] === 'string' && (c[1] as string).endsWith('-shm'),
      );
      expect(shmCall).toBeDefined();
      expect(shmCall![0]).toBe(`${tmpDir}/database.sqlite-shm`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not copy WAL sidecar when it does not exist locally', async () => {
    const { service, copyToDirectus } = buildDockerRestoreService();
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite');
      // No WAL file created

      await (service as any).copyDatabaseIn(tmpDir);

      const walCall = copyToDirectus.mock.calls.find(
        (c: unknown[]) => typeof c[1] === 'string' && (c[1] as string).endsWith('-wal'),
      );
      expect(walCall).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('copies uploads directory when directusStorageIsLocal is true and uploads dir exists', async () => {
    const { service, copyToDirectus } = buildDockerRestoreService({
      directusStorageIsLocal: true,
      directusStorageRoot: '/directus/uploads',
    });
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite');
      fs.mkdirSync(path.join(tmpDir, 'uploads'));
      fs.writeFileSync(path.join(tmpDir, 'uploads', 'file.jpg'), 'fake image');

      await (service as any).copyDatabaseIn(tmpDir);

      expect(copyToDirectus).toHaveBeenCalledWith(
        `${tmpDir}/uploads`,
        '/directus/uploads',
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips uploads when directusStorageIsLocal is false', async () => {
    const { service, copyToDirectus } = buildDockerRestoreService({
      directusStorageIsLocal: false,
      directusStorageRoot: 's3://bucket/uploads',
    });
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite');
      fs.mkdirSync(path.join(tmpDir, 'uploads'));

      await (service as any).copyDatabaseIn(tmpDir);

      const uploadCall = copyToDirectus.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).endsWith('/uploads'),
      );
      expect(uploadCall).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips uploads when uploads dir does not exist locally', async () => {
    const { service, copyToDirectus } = buildDockerRestoreService({
      directusStorageIsLocal: true,
      directusStorageRoot: '/directus/uploads',
    });
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite');
      // No uploads directory created

      await (service as any).copyDatabaseIn(tmpDir);

      const uploadCall = copyToDirectus.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).endsWith('/uploads'),
      );
      expect(uploadCall).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('does NOT set dockerContainerService.mount (no sidecar for file path)', async () => {
    const { service, dockerContainerService } = buildDockerRestoreService();
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite');

      await (service as any).copyDatabaseIn(tmpDir);

      expect(dockerContainerService.mount).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when databaseFilename is undefined', async () => {
    const { service } = buildDockerRestoreService({ noFilename: true });
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'database.sqlite'), 'fake sqlite');

      await expect((service as any).copyDatabaseIn(tmpDir)).rejects.toThrow(
        /SQLite database path not found/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
