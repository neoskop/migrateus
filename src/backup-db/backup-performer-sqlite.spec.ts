// Tests for the SQLite / file-based backup path in BackupPerformer.
// The sidecar (containerService.setup, performMysqlDump, setupDirectusUser) must
// NOT be called when sqlService.usesSidecar is false.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import { BackupPerformer } from './backup-performer.js';

type AnyMock = jest.Mock<any>;

interface MockSqlService {
  client: string;
  clientImage: string;
  usesSidecar: boolean;
  databaseFilename: string | undefined;
  performMysqlDump: AnyMock;
  setupDirectusUser: AnyMock;
  cleanUpDirectusUser: AnyMock;
}

interface MockContainerService {
  setup: AnyMock;
  cleanUp: AnyMock;
  image: string;
}

// Concrete subclass that captures copyDatabaseOut calls and exposes getDirectusVersionHint
class TestSqliteBackupPerformer extends BackupPerformer {
  public copyDatabaseOutCalled = false;
  public copyDatabaseOutDir: string | undefined;

  protected async setup(): Promise<void> {}

  protected async getDirectusPort(): Promise<number> {
    return 8055;
  }

  protected async copyDatabaseOut(backupDir: string): Promise<void> {
    this.copyDatabaseOutCalled = true;
    this.copyDatabaseOutDir = backupDir;
  }

  protected getDirectusVersionHint(): string | undefined {
    return '11.16.1';
  }
}

function buildSqliteMock(overrides?: Partial<MockSqlService>): {
  performer: TestSqliteBackupPerformer;
  sqlService: MockSqlService;
  containerService: MockContainerService;
  writeFileSpy: jest.SpiedFunction<typeof fs.promises.writeFile>;
} {
  const sqlService: MockSqlService = {
    client: 'sqlite3',
    clientImage: 'neoskop/migrateus:latest',
    usesSidecar: false,
    databaseFilename: '/database/sqlite.db',
    performMysqlDump: jest.fn(async () => undefined),
    setupDirectusUser: jest.fn(async () => undefined),
    cleanUpDirectusUser: jest.fn(async () => undefined),
    ...overrides,
  };

  const containerService: MockContainerService = {
    setup: jest.fn(async () => undefined),
    cleanUp: jest.fn(async () => undefined),
    image: '',
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
    getVersion: jest.fn(async () => '11.16.1'),
  } as never;

  const directusAssetService = {} as never;
  const config = { noAssets: true } as never;

  const performer = new TestSqliteBackupPerformer(
    { debug: jest.fn() } as never,
    directusAssetService,
    sqlService as never,
    containerService as never,
    config,
    progressService,
    directusVersionService,
  );

  const writeFileSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as never);

  return { performer, sqlService, containerService, writeFileSpy };
}

describe('BackupPerformer SQLite path (usesSidecar=false)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls copyDatabaseOut instead of containerService.setup when usesSidecar is false', async () => {
    const { performer, containerService } = buildSqliteMock();

    await performer.backup('output.tar.gz');

    expect(performer.copyDatabaseOutCalled).toBe(true);
    expect(containerService.setup).not.toHaveBeenCalled();
  });

  it('does not call performMysqlDump for the SQLite path', async () => {
    const { performer, sqlService } = buildSqliteMock();

    await performer.backup('output.tar.gz');

    expect(sqlService.performMysqlDump).not.toHaveBeenCalled();
  });

  it('does not call setupDirectusUser for the SQLite path', async () => {
    const { performer, sqlService } = buildSqliteMock();

    await performer.backup('output.tar.gz');

    expect(sqlService.setupDirectusUser).not.toHaveBeenCalled();
  });

  it('does not call containerService.cleanUp for the SQLite path (no sidecar was started)', async () => {
    const { performer, containerService } = buildSqliteMock();

    await performer.backup('output.tar.gz');

    expect(containerService.cleanUp).not.toHaveBeenCalled();
  });

  it('writes meta.json without calling directusVersionService.getVersion over HTTP', async () => {
    const { performer, writeFileSpy } = buildSqliteMock();

    await performer.backup('output.tar.gz');

    const writeCall = writeFileSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('meta.json'),
    );
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1] as string);
    expect(written).toHaveProperty('client', 'sqlite3');
    expect(written).toHaveProperty('timestamp');
  });

  it('includes dbFilename and version hint in meta.json for the SQLite path', async () => {
    const { performer, writeFileSpy } = buildSqliteMock();

    await performer.backup('output.tar.gz');

    const writeCall = writeFileSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('meta.json'),
    );
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1] as string);
    expect(written).toHaveProperty('dbFilename', '/database/sqlite.db');
    expect(written).toHaveProperty('version', '11.16.1');
  });

  // Regression: the driver (and thus `usesSidecar`) only exists AFTER platform
  // setup() runs. backup() must call setup() before branching on usesSidecar.
  it('runs setup() before reading usesSidecar', async () => {
    jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as never);
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
      performMysqlDump: jest.fn(async () => undefined),
      setupDirectusUser: jest.fn(async () => undefined),
      cleanUpDirectusUser: jest.fn(async () => undefined),
    };

    class P extends BackupPerformer {
      public copied = false;
      protected async setup(): Promise<void> {
        sqlService._ready = true; // mimic platform setup creating the driver
      }
      protected async getDirectusPort(): Promise<number> {
        return 8055;
      }
      protected async copyDatabaseOut(): Promise<void> {
        this.copied = true;
      }
      protected getDirectusVersionHint(): string | undefined {
        return undefined;
      }
    }

    const progressService = {
      advance: jest.fn(),
      succeed: jest.fn(),
      fail: jest.fn(),
      finish: jest.fn(),
      updateText: jest.fn(),
      warn: jest.fn(),
    } as never;

    const performer = new P(
      { debug: jest.fn() } as never,
      {} as never,
      sqlService as never,
      { setup: jest.fn(), cleanUp: jest.fn(), image: '' } as never,
      { noAssets: true } as never,
      progressService,
      { getVersion: jest.fn() } as never,
    );

    await expect(performer.backup('output.tar.gz')).resolves.toBeUndefined();
    expect(performer.copied).toBe(true);
  });
});
