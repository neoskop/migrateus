/**
 * Tests for RestorePerformer's new restore flow:
 *  - extractBackupArchive: only runs tar -xf (no stored-procedure prepend)
 *  - readManifest: parses meta.json client field; defaults to 'mysql' when absent
 *  - restore(): calls dropAllTables then transferRestore with manifest.client
 */
import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RestorePerformer } from './restore-performer.js';

// ---- minimal concrete subclass ----------------------------------------

type AnyMock = jest.Mock<any>;

interface MockSqlService {
  dropAllTables: AnyMock;
  transferRestore: AnyMock;
  restoreMysqlDump: AnyMock;
  setupDirectusUser: AnyMock;
  cleanUpDirectusUser: AnyMock;
  setCredentials: AnyMock;
  setAssetStorage: AnyMock;
}

function makeMockSqlService(): MockSqlService {
  return {
    dropAllTables: jest.fn(async () => undefined),
    transferRestore: jest.fn(async () => undefined),
    restoreMysqlDump: jest.fn(async () => undefined),
    setupDirectusUser: jest.fn(async () => undefined),
    cleanUpDirectusUser: jest.fn(async () => undefined),
    setCredentials: jest.fn(async () => undefined),
    setAssetStorage: jest.fn(async () => undefined),
  };
}

// Build a concrete subclass with fully mocked collaborators
function buildPerformer(sqlService: MockSqlService, opts?: {
  force?: boolean;
  directusPort?: number;
}) {
  const logger = { debug: jest.fn(), warn: jest.fn() };
  const containerService = { setup: jest.fn(async () => undefined), cleanUp: jest.fn(async () => undefined), execute: jest.fn(async () => ({ code: 0, stdout: '', stderr: '' })) };
  const environmentService = {
    environment: {
      credentials: [],
      assetStorage: undefined as string | undefined,
      settings: undefined as any,
    },
  };
  const progressService = {
    advance: jest.fn(),
    warn: jest.fn(),
    fail: jest.fn(),
    finish: jest.fn(),
    updateText: jest.fn(),
  };
  const directusAssetService = {
    restoreAssets: jest.fn(async () => 0),
  };
  const directusSettingService = {
    updateSettings: jest.fn(async () => undefined),
  };
  const directusVersionService = {
    getVersion: jest.fn(async () => '10.0.0'),
    isDangerousMismatch: jest.fn(() => false),
  };
  const configService = {
    force: opts?.force ?? true, // default force=true to skip version comparison
  };

  class TestPerformer extends RestorePerformer {
    public _backupDir = '';

    protected async setup(backupDir: string): Promise<void> {
      this._backupDir = backupDir;
    }

    protected async getDirectusPort(): Promise<number> {
      return opts?.directusPort ?? 8055;
    }

    protected async restartDirectus(): Promise<void> {}

    // expose private readManifest for white-box testing
    public readManifestPublic(dir: string) {
      return (this as any).readManifest(dir);
    }
  }

  const performer = new TestPerformer(
    logger as never,
    directusAssetService as never,
    directusSettingService as never,
    sqlService as never,
    containerService as never,
    environmentService as never,
    progressService as never,
    directusVersionService as never,
    configService as never,
  );

  return { performer, containerService, progressService, sqlService, directusAssetService };
}

// ---- helpers for temp dirs/files ----------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rp-test-'));
}

function cleanTempDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- tests ---------------------------------------------------------------

describe('RestorePerformer.readManifest', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { cleanTempDir(tmpDir); });

  it('returns { client: "mysql" } when meta.json is absent', async () => {
    const { performer } = buildPerformer(makeMockSqlService());
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest).toEqual({ client: 'mysql' });
  });

  it('returns parsed client from meta.json', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'meta.json'),
      JSON.stringify({ version: '10.1.0', client: 'pg' }),
    );
    const { performer } = buildPerformer(makeMockSqlService());
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest.client).toBe('pg');
    expect(manifest.version).toBe('10.1.0');
  });

  it('defaults client to "mysql" when meta.json has no client field', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'meta.json'),
      JSON.stringify({ version: '9.0.0' }),
    );
    const { performer } = buildPerformer(makeMockSqlService());
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest.client).toBe('mysql');
    expect(manifest.version).toBe('9.0.0');
  });
});

describe('RestorePerformer.restore() — drop + transfer flow', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { cleanTempDir(tmpDir); });

  it('calls dropAllTables then transferRestore with mysql client for legacy backup (no meta.json)', async () => {
    // We need an actual backup archive; create a minimal tar with backup.sql
    const backupSql = path.join(tmpDir, 'backup.sql');
    fs.writeFileSync(backupSql, '-- sql content');
    const archivePath = path.join(tmpDir, 'backup.tar');
    const { execSync } = await import('node:child_process');
    execSync(`tar -cf ${archivePath} -C ${tmpDir} backup.sql`);

    const sqlService = makeMockSqlService();
    const { performer, progressService } = buildPerformer(sqlService, { force: true });

    await performer.restore(archivePath);

    expect(sqlService.dropAllTables).toHaveBeenCalledTimes(1);
    expect(sqlService.transferRestore).toHaveBeenCalledTimes(1);
    const [, sourceClient] = sqlService.transferRestore.mock.calls[0] as any[];
    expect(sourceClient).toBe('mysql');
  });

  it('calls transferRestore with "pg" client when meta.json declares pg', async () => {
    const srcDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(srcDir, 'backup.sql'), '-- pg dump');
      fs.writeFileSync(path.join(srcDir, 'meta.json'), JSON.stringify({ client: 'pg', version: '10.0.0' }));
      const archivePath = path.join(tmpDir, 'backup.tar');
      const { execSync } = await import('node:child_process');
      execSync(`tar -cf ${archivePath} -C ${srcDir} backup.sql meta.json`);

      const sqlService = makeMockSqlService();
      const { performer } = buildPerformer(sqlService, { force: true });

      await performer.restore(archivePath);

      expect(sqlService.dropAllTables).toHaveBeenCalledTimes(1);
      expect(sqlService.transferRestore).toHaveBeenCalledTimes(1);
      const [, sourceClient] = sqlService.transferRestore.mock.calls[0] as any[];
      expect(sourceClient).toBe('pg');
    } finally {
      cleanTempDir(srcDir);
    }
  });

  it('does NOT prepend stored-procedure SQL to backup.sql during extraction', async () => {
    const srcDir = makeTempDir();
    try {
      const originalContent = '-- clean sql, no stored proc';
      fs.writeFileSync(path.join(srcDir, 'backup.sql'), originalContent);
      const archivePath = path.join(tmpDir, 'backup.tar');
      const { execSync } = await import('node:child_process');
      execSync(`tar -cf ${archivePath} -C ${srcDir} backup.sql`);

      const sqlService = makeMockSqlService();
      // Intercept via beforeMysqlDumpRestore (called after extractBackupArchive,
      // before cleanup) to read backup.sql from the live temp dir.
      let capturedContent = '';
      let capturedBackupDir = '';
      const { performer } = buildPerformer(sqlService, { force: true });
      (performer as any)._setupOrig = (performer as any).setup.bind(performer);
      (performer as any).setup = async (dir: string) => {
        capturedBackupDir = dir;
        return (performer as any)._setupOrig(dir);
      };
      // beforeMysqlDumpRestore is called after setup and extract, before cleanup
      (performer as any).beforeMysqlDumpRestore = async () => {
        capturedContent = fs.readFileSync(path.join(capturedBackupDir, 'backup.sql'), 'utf8');
      };

      await performer.restore(archivePath);

      expect(capturedContent).toBe(originalContent);
      expect(capturedContent).not.toContain('drop_all_tables');
      expect(capturedContent).not.toContain('DELIMITER');
    } finally {
      cleanTempDir(srcDir);
    }
  });
});
