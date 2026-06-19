// Tests for RestorePerformer's SQLite / file-based restore path.
// When sqlService.usesSidecar is false, restore() must:
//   - call copyDatabaseIn (the abstract hook)
//   - call restartDirectus (the abstract hook)
//   - NOT call containerService.setup(), dropAllTables, transferRestore, or setupDirectusUser
//   - NOT call containerService.cleanUp() (no sidecar was started)

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { RestorePerformer } from './restore-performer.js';

type AnyMock = jest.Mock<any>;

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rp-sqlite-test-'));
}

function cleanTempDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function buildSqliteRestorePerformer() {
  const sqlService = {
    client: 'sqlite3' as const,
    clientImage: 'neoskop/migrateus:latest',
    usesSidecar: false,
    databaseFilename: '/database/sqlite.db',
    dropAllTables: jest.fn(async () => undefined) as AnyMock,
    transferRestore: jest.fn(async () => undefined) as AnyMock,
    setupDirectusUser: jest.fn(async () => undefined) as AnyMock,
    cleanUpDirectusUser: jest.fn(async () => undefined) as AnyMock,
    setCredentials: jest.fn(async () => undefined) as AnyMock,
    setAssetStorage: jest.fn(async () => undefined) as AnyMock,
  };

  const containerService = {
    setup: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
    execute: jest.fn(async () => ({ code: 0, stdout: '', stderr: '' })) as AnyMock,
    image: '',
  };

  const progressService = {
    advance: jest.fn(),
    warn: jest.fn(),
    fail: jest.fn(),
    finish: jest.fn(),
    updateText: jest.fn(),
  };

  const directusAssetService = {
    restoreAssets: jest.fn(async () => 0) as AnyMock,
  };

  const directusSettingService = {
    updateSettings: jest.fn(async () => undefined) as AnyMock,
  };

  const directusVersionService = {
    getVersion: jest.fn(async () => '10.0.0') as AnyMock,
    isDangerousMismatch: jest.fn(() => false) as AnyMock,
  };

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

  const copyDatabaseIn = jest.fn(async () => undefined) as AnyMock;
  const restartDirectus = jest.fn(async () => undefined) as AnyMock;

  class TestSqliteRestorePerformer extends RestorePerformer {
    protected async setup(_backupDir: string): Promise<void> {}
    protected async getDirectusPort(): Promise<number> { return 8055; }
    protected async restartDirectus(): Promise<void> { return restartDirectus(); }
    protected async copyDatabaseIn(_backupDir: string): Promise<void> { return copyDatabaseIn(_backupDir); }
  }

  const performer = new TestSqliteRestorePerformer(
    { debug: jest.fn(), warn: jest.fn() } as never,
    directusAssetService as never,
    directusSettingService as never,
    sqlService as never,
    containerService as never,
    environmentService as never,
    progressService as never,
    directusVersionService as never,
    configService as never,
  );

  return {
    performer,
    sqlService,
    containerService,
    copyDatabaseIn,
    restartDirectus,
    progressService,
  };
}

describe('RestorePerformer SQLite path (usesSidecar=false)', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanTempDir(tmpDir);
  });

  function makeArchive(dir: string): string {
    const archivePath = path.join(dir, 'backup.tar');
    // Create a minimal archive with just meta.json (sqlite backup has no backup.sql)
    const metaPath = path.join(dir, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify({ client: 'sqlite3', dbFilename: '/database/sqlite.db' }));
    execSync(`tar -cf ${archivePath} -C ${dir} meta.json`);
    return archivePath;
  }

  it('calls copyDatabaseIn when usesSidecar is false', async () => {
    const { performer, copyDatabaseIn } = buildSqliteRestorePerformer();
    const archivePath = makeArchive(tmpDir);

    await performer.restore(archivePath);

    expect(copyDatabaseIn).toHaveBeenCalledTimes(1);
  });

  it('calls restartDirectus when usesSidecar is false', async () => {
    const { performer, restartDirectus } = buildSqliteRestorePerformer();
    const archivePath = makeArchive(tmpDir);

    await performer.restore(archivePath);

    expect(restartDirectus).toHaveBeenCalledTimes(1);
  });

  it('does NOT call containerService.setup() for the SQLite path', async () => {
    const { performer, containerService } = buildSqliteRestorePerformer();
    const archivePath = makeArchive(tmpDir);

    await performer.restore(archivePath);

    expect(containerService.setup).not.toHaveBeenCalled();
  });

  it('does NOT call dropAllTables for the SQLite path', async () => {
    const { performer, sqlService } = buildSqliteRestorePerformer();
    const archivePath = makeArchive(tmpDir);

    await performer.restore(archivePath);

    expect(sqlService.dropAllTables).not.toHaveBeenCalled();
  });

  it('does NOT call transferRestore for the SQLite path', async () => {
    const { performer, sqlService } = buildSqliteRestorePerformer();
    const archivePath = makeArchive(tmpDir);

    await performer.restore(archivePath);

    expect(sqlService.transferRestore).not.toHaveBeenCalled();
  });

  it('does NOT call setupDirectusUser for the SQLite path', async () => {
    const { performer, sqlService } = buildSqliteRestorePerformer();
    const archivePath = makeArchive(tmpDir);

    await performer.restore(archivePath);

    expect(sqlService.setupDirectusUser).not.toHaveBeenCalled();
  });

  it('does NOT call containerService.cleanUp() for the SQLite path (no sidecar started)', async () => {
    const { performer, containerService } = buildSqliteRestorePerformer();
    const archivePath = makeArchive(tmpDir);

    await performer.restore(archivePath);

    expect(containerService.cleanUp).not.toHaveBeenCalled();
  });

  // Regression: the driver (and thus `usesSidecar`) only exists AFTER platform
  // setup() runs. restore() must extract + setup before branching on usesSidecar.
  it('runs setup() before reading usesSidecar', async () => {
    const archivePath = makeArchive(tmpDir);
    const copyDatabaseIn = jest.fn(async () => undefined) as AnyMock;
    const sqlService: any = {
      client: 'sqlite3',
      clientImage: 'neoskop/migrateus:latest',
      databaseFilename: '/database/sqlite.db',
      _ready: false,
      get usesSidecar() {
        if (!this._ready) {
          throw new TypeError(
            "Cannot read properties of undefined (reading 'usesSidecar')",
          );
        }
        return false;
      },
      cleanUpDirectusUser: jest.fn(async () => undefined),
    };

    class P extends RestorePerformer {
      protected async setup(): Promise<void> {
        sqlService._ready = true; // mimic platform setup creating the driver
      }
      protected async getDirectusPort(): Promise<number> {
        return 8055;
      }
      protected async restartDirectus(): Promise<void> {}
      protected async copyDatabaseIn(dir: string): Promise<void> {
        return copyDatabaseIn(dir);
      }
    }

    const performer = new P(
      { debug: jest.fn(), warn: jest.fn() } as never,
      {} as never,
      {} as never,
      sqlService as never,
      { setup: jest.fn(), cleanUp: jest.fn(), image: '' } as never,
      { environment: {} } as never,
      {
        advance: jest.fn(),
        warn: jest.fn(),
        fail: jest.fn(),
        finish: jest.fn(),
        updateText: jest.fn(),
      } as never,
      { getVersion: jest.fn(), isDangerousMismatch: jest.fn(() => false) } as never,
      { force: true } as never,
    );

    await expect(performer.restore(archivePath)).resolves.toBeUndefined();
    expect(copyDatabaseIn).toHaveBeenCalledTimes(1);
  });
});
