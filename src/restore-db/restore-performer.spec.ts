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
  client: 'mysql' | 'pg' | 'sqlite3';
  clientImage: string;
  usesSidecar: boolean;
  dropAllTables: AnyMock;
  transferRestore: AnyMock;
  restoreMysqlDump: AnyMock;
  setupDirectusUser: AnyMock;
  cleanUpDirectusUser: AnyMock;
  setCredentials: AnyMock;
  setAssetStorage: AnyMock;
  executeSql: AnyMock;
  escapeIdentifier: (id: string) => string;
  escapeString: (v: string) => string;
}

const CLIENT_IMAGE_MAP: Record<'mysql' | 'pg' | 'sqlite3', string> = {
  mysql: 'neoskop/migrateus:latest',
  pg: 'neoskop/migrateus:latest',
  sqlite3: 'neoskop/migrateus:latest',
};

function makeMockSqlService(client: 'mysql' | 'pg' | 'sqlite3' = 'mysql', clientImage?: string): MockSqlService {
  return {
    client,
    clientImage: clientImage ?? CLIENT_IMAGE_MAP[client],
    usesSidecar: true, // server engines use sidecar; SQLite does not
    dropAllTables: jest.fn(async () => undefined),
    transferRestore: jest.fn(async () => undefined),
    restoreMysqlDump: jest.fn(async () => undefined),
    setupDirectusUser: jest.fn(async () => undefined),
    cleanUpDirectusUser: jest.fn(async () => undefined),
    setCredentials: jest.fn(async () => undefined),
    setAssetStorage: jest.fn(async () => undefined),
    executeSql: jest.fn(async () => ''),
    escapeIdentifier: (id: string) => `"${id}"`,
    escapeString: (v: string) => `'${v}'`,
  };
}

// Build a concrete subclass with fully mocked collaborators
function buildPerformer(sqlService: MockSqlService, opts?: {
  force?: boolean;
  directusPort?: number;
  pseudonymize?: boolean;
  rules?: Record<string, Record<string, string | null>>;
}) {
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const containerService = { setup: jest.fn(async () => undefined) as AnyMock, cleanUp: jest.fn(async () => undefined) as AnyMock, execute: jest.fn(async () => ({ code: 0, stdout: '', stderr: '' })) as AnyMock, image: 'neoskop/migrateus:latest' };
  const environmentService = {
    environment: {
      credentials: [],
      assetStorage: undefined as string | undefined,
      settings: undefined as any,
      name: 'stage',
      pseudonymize: opts?.pseudonymize,
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
    getPseudonymizeRules: () => opts?.rules,
    getCredentialEmails: () => new Set<string>(),
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

    public stop = jest.fn(async () => undefined) as AnyMock;
    public start = jest.fn(async (_port: number) => 9000) as AnyMock;

    protected stopDirectus(): Promise<void> {
      return this.stop();
    }

    protected startDirectus(port: number): Promise<number> {
      return this.start(port);
    }

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

  return { performer, containerService: containerService as { setup: AnyMock; cleanUp: AnyMock; execute: AnyMock; image: string }, progressService, sqlService, directusAssetService };
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

  it('returns target engine client when meta.json is absent (mysql target)', async () => {
    const { performer } = buildPerformer(makeMockSqlService('mysql'));
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest).toEqual({ client: 'mysql', format: 'physical', pseudonymized: false });
  });

  it('returns target engine client when meta.json is absent (pg target)', async () => {
    const { performer } = buildPerformer(makeMockSqlService('pg'));
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest).toEqual({ client: 'pg', format: 'physical', pseudonymized: false });
  });

  it('returns parsed client from meta.json', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'meta.json'),
      JSON.stringify({ version: '10.1.0', client: 'pg' }),
    );
    const { performer } = buildPerformer(makeMockSqlService('mysql'));
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest.client).toBe('pg');
    expect(manifest.version).toBe('10.1.0');
  });

  it('defaults client to target engine when meta.json has no client field (mysql target)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'meta.json'),
      JSON.stringify({ version: '9.0.0' }),
    );
    const { performer } = buildPerformer(makeMockSqlService('mysql'));
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest.client).toBe('mysql');
    expect(manifest.version).toBe('9.0.0');
  });

  it('defaults client to target engine when meta.json has no client field (pg target)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'meta.json'),
      JSON.stringify({ version: '9.0.0' }),
    );
    const { performer } = buildPerformer(makeMockSqlService('pg'));
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest.client).toBe('pg');
    expect(manifest.version).toBe('9.0.0');
  });

  it('returns format: "physical" when meta.json is absent (no format field to read)', async () => {
    const { performer } = buildPerformer(makeMockSqlService('mysql'));
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest).toHaveProperty('format', 'physical');
  });

  it('returns format: "physical" when meta.json exists but has no format field', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'meta.json'),
      JSON.stringify({ version: '10.0.0', client: 'mysql' }),
    );
    const { performer } = buildPerformer(makeMockSqlService('mysql'));
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest).toHaveProperty('format', 'physical');
  });

  it('returns format: "logical" when meta.json contains format: "logical"', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'meta.json'),
      JSON.stringify({ version: '10.0.0', client: 'mysql', format: 'logical' }),
    );
    const { performer } = buildPerformer(makeMockSqlService('mysql'));
    const manifest = await performer.readManifestPublic(tmpDir);
    expect(manifest).toHaveProperty('format', 'logical');
  });
});

describe('RestorePerformer.restore() — drop + transfer flow', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { cleanTempDir(tmpDir); });

  it('calls dropAllTables then transferRestore with mysql client for legacy backup (no meta.json, mysql target)', async () => {
    // We need an actual backup archive; create a minimal tar with backup.sql
    const backupSql = path.join(tmpDir, 'backup.sql');
    fs.writeFileSync(backupSql, '-- sql content');
    const archivePath = path.join(tmpDir, 'backup.tar');
    const { execSync } = await import('node:child_process');
    execSync(`tar -cf ${archivePath} -C ${tmpDir} backup.sql`);

    const sqlService = makeMockSqlService('mysql');
    const { performer, progressService } = buildPerformer(sqlService, { force: true });

    await performer.restore(archivePath);

    expect(sqlService.dropAllTables).toHaveBeenCalledTimes(1);
    expect(sqlService.transferRestore).toHaveBeenCalledTimes(1);
    const [, sourceClient] = sqlService.transferRestore.mock.calls[0] as any[];
    expect(sourceClient).toBe('mysql');
  });

  it('calls transferRestore with target engine ("pg") for manifest-less backup when target is pg', async () => {
    const backupSql = path.join(tmpDir, 'backup.sql');
    fs.writeFileSync(backupSql, '-- pg dump');
    const archivePath = path.join(tmpDir, 'backup.tar');
    const { execSync } = await import('node:child_process');
    execSync(`tar -cf ${archivePath} -C ${tmpDir} backup.sql`);

    const sqlService = makeMockSqlService('pg');
    const { performer } = buildPerformer(sqlService, { force: true });

    await performer.restore(archivePath);

    expect(sqlService.transferRestore).toHaveBeenCalledTimes(1);
    const [, sourceClient] = sqlService.transferRestore.mock.calls[0] as any[];
    expect(sourceClient).toBe('pg');
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

describe('RestorePerformer: containerService.image set from sqlService.clientImage before setup()', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { cleanTempDir(tmpDir); });

  it('sets containerService.image to sqlService.clientImage before calling containerService.setup()', async () => {
    const backupSql = path.join(tmpDir, 'backup.sql');
    fs.writeFileSync(backupSql, '-- sql content');
    const archivePath = path.join(tmpDir, 'backup.tar');
    const { execSync } = await import('node:child_process');
    execSync(`tar -cf ${archivePath} -C ${tmpDir} backup.sql`);

    const pgImage = 'neoskop/migrateus:latest';
    const sqlService = makeMockSqlService('pg', pgImage);
    const { performer, containerService } = buildPerformer(sqlService, { force: true });

    let imageAtSetupTime: string | undefined;
    containerService.setup.mockImplementation(async () => {
      imageAtSetupTime = containerService.image;
    });

    await performer.restore(archivePath);

    expect(imageAtSetupTime).toBe(pgImage);
    expect(containerService.image).toBe(pgImage);
  });

  it('uses the mysql image for a mysql driver (no behavior change for existing mysql deployments)', async () => {
    const backupSql = path.join(tmpDir, 'backup.sql');
    fs.writeFileSync(backupSql, '-- sql content');
    const archivePath = path.join(tmpDir, 'backup.tar');
    const { execSync } = await import('node:child_process');
    execSync(`tar -cf ${archivePath} -C ${tmpDir} backup.sql`);

    const mysqlImage = 'neoskop/migrateus:latest';
    const sqlService = makeMockSqlService('mysql', mysqlImage);
    const { performer, containerService } = buildPerformer(sqlService, { force: true });

    let imageAtSetupTime: string | undefined;
    containerService.setup.mockImplementation(async () => {
      imageAtSetupTime = containerService.image;
    });

    await performer.restore(archivePath);

    expect(imageAtSetupTime).toBe(mysqlImage);
  });
});

describe('RestorePerformer server flow: artifact path is manifest-aware', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { cleanTempDir(tmpDir); });

  it('passes /tmp/backup.sql to transferRestore when manifest.client is pg (server→server)', async () => {
    const srcDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(srcDir, 'backup.sql'), '-- pg dump');
      fs.writeFileSync(path.join(srcDir, 'meta.json'), JSON.stringify({ client: 'pg', version: '10.0.0' }));
      const archivePath = path.join(tmpDir, 'backup.tar');
      const { execSync } = await import('node:child_process');
      execSync(`tar -cf ${archivePath} -C ${srcDir} backup.sql meta.json`);

      const sqlService = makeMockSqlService('pg'); // target is pg, usesSidecar=true
      const { performer } = buildPerformer(sqlService, { force: true });

      await performer.restore(archivePath);

      expect(sqlService.transferRestore).toHaveBeenCalledTimes(1);
      const [, , artifactPath] = sqlService.transferRestore.mock.calls[0] as any[];
      expect(artifactPath).toBe('/tmp/backup.sql');
    } finally {
      cleanTempDir(srcDir);
    }
  });

  it('passes /tmp/database.sqlite to transferRestore when manifest.client is sqlite3 (cross-engine sqlite→pg)', async () => {
    const srcDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(srcDir, 'database.sqlite'), 'fake sqlite binary');
      fs.writeFileSync(path.join(srcDir, 'meta.json'), JSON.stringify({ client: 'sqlite3', dbFilename: '/database/sqlite.db', version: '10.0.0' }));
      const archivePath = path.join(tmpDir, 'backup.tar');
      const { execSync } = await import('node:child_process');
      execSync(`tar -cf ${archivePath} -C ${srcDir} database.sqlite meta.json`);

      const sqlService = makeMockSqlService('pg'); // target is pg server, usesSidecar=true
      const { performer } = buildPerformer(sqlService, { force: true });

      await performer.restore(archivePath);

      expect(sqlService.transferRestore).toHaveBeenCalledTimes(1);
      const [, sourceClient, artifactPath] = sqlService.transferRestore.mock.calls[0] as any[];
      expect(sourceClient).toBe('sqlite3');
      expect(artifactPath).toBe('/tmp/database.sqlite');
    } finally {
      cleanTempDir(srcDir);
    }
  });

  it('passes /tmp/backup.sql to transferRestore when manifest.client is mysql (server→server)', async () => {
    const srcDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(srcDir, 'backup.sql'), '-- mysql dump');
      fs.writeFileSync(path.join(srcDir, 'meta.json'), JSON.stringify({ client: 'mysql', version: '10.0.0' }));
      const archivePath = path.join(tmpDir, 'backup.tar');
      const { execSync } = await import('node:child_process');
      execSync(`tar -cf ${archivePath} -C ${srcDir} backup.sql meta.json`);

      const sqlService = makeMockSqlService('mysql'); // target is mysql, usesSidecar=true
      const { performer } = buildPerformer(sqlService, { force: true });

      await performer.restore(archivePath);

      expect(sqlService.transferRestore).toHaveBeenCalledTimes(1);
      const [, , artifactPath] = sqlService.transferRestore.mock.calls[0] as any[];
      expect(artifactPath).toBe('/tmp/backup.sql');
    } finally {
      cleanTempDir(srcDir);
    }
  });
});

describe('RestorePerformer server flow: pseudonymization', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { cleanTempDir(tmpDir); });

  async function archive(meta?: object): Promise<string> {
    fs.writeFileSync(path.join(tmpDir, 'backup.sql'), '-- sql');
    const members = ['backup.sql'];
    if (meta) {
      fs.writeFileSync(path.join(tmpDir, 'meta.json'), JSON.stringify(meta));
      members.push('meta.json');
    }
    const archivePath = path.join(tmpDir, 'backup.tar');
    const { execSync } = await import('node:child_process');
    execSync(`tar -cf ${archivePath} -C ${tmpDir} ${members.join(' ')}`);
    return archivePath;
  }

  const rules = { customers: { name: 'person.fullName' } };

  it('pseudonymizes after the dump restore and before credentials when the env opts in', async () => {
    const sqlService = makeMockSqlService('pg');
    sqlService.executeSql.mockImplementation(async (sql: any) =>
      sql.startsWith('SELECT') ? '1\n' : '',
    );
    const { performer } = buildPerformer(sqlService, { pseudonymize: true, rules });

    await performer.restore(await archive());

    const statements = sqlService.executeSql.mock.calls.map((c) => c[0] as string);
    expect(statements[0]).toBe('SELECT "id" FROM "customers"');
    expect(statements[1]).toMatch(/^UPDATE "customers" SET "name" = /);
    expect(statements).toContain('DELETE FROM "directus_revisions"');
    expect(sqlService.executeSql.mock.invocationCallOrder[0]).toBeGreaterThan(
      sqlService.transferRestore.mock.invocationCallOrder[0],
    );
    expect(sqlService.executeSql.mock.invocationCallOrder[0]).toBeLessThan(
      sqlService.setCredentials.mock.invocationCallOrder[0],
    );
  });

  it('skips archives already pseudonymized at backup time', async () => {
    const sqlService = makeMockSqlService('pg');
    const { performer } = buildPerformer(sqlService, { pseudonymize: true, rules });
    await performer.restore(await archive({ client: 'pg', pseudonymized: true }));
    expect(sqlService.executeSql).not.toHaveBeenCalled();
  });

  it('skips environments that do not opt in', async () => {
    const sqlService = makeMockSqlService('pg');
    const { performer } = buildPerformer(sqlService, { rules });
    await performer.restore(await archive());
    expect(sqlService.executeSql).not.toHaveBeenCalled();
  });

  it('fails the restore when the env opts in but no rules exist', async () => {
    const sqlService = makeMockSqlService('pg');
    const { performer, progressService } = buildPerformer(sqlService, { pseudonymize: true });
    await performer.restore(await archive());
    expect(progressService.fail).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/no 'pseudonymize' rules/) }),
    );
  });
});

describe('RestorePerformer server flow: Directus is stopped during the restore', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { cleanTempDir(tmpDir); });

  async function archive(): Promise<string> {
    fs.writeFileSync(path.join(tmpDir, 'backup.sql'), '-- sql');
    const archivePath = path.join(tmpDir, 'backup.tar');
    const { execSync } = await import('node:child_process');
    execSync(`tar -cf ${archivePath} -C ${tmpDir} backup.sql`);
    return archivePath;
  }

  it('stops Directus before dropping tables and starts it before using its API again', async () => {
    const sqlService = makeMockSqlService('mysql');
    const { performer, directusAssetService } = buildPerformer(sqlService);

    await performer.restore(await archive());

    const order = (mock: AnyMock) => mock.mock.invocationCallOrder[0];
    expect(order(performer.stop)).toBeLessThan(order(sqlService.dropAllTables));
    expect(order(performer.start)).toBeGreaterThan(order(sqlService.transferRestore));
    expect(order(performer.start)).toBeLessThan(order(sqlService.setupDirectusUser));
    expect(performer.start).toHaveBeenCalledWith(8055);
    expect(sqlService.setupDirectusUser).toHaveBeenCalledWith(expect.anything(), 9000);
    expect(directusAssetService.restoreAssets.mock.calls[0][0]).toBe(9000);
  });

  it('starts Directus again when the restore fails while it is stopped', async () => {
    const sqlService = makeMockSqlService('mysql');
    sqlService.transferRestore.mockImplementation(async () => {
      throw new Error('deadlock');
    });
    const { performer, progressService } = buildPerformer(sqlService);

    await performer.restore(await archive());

    expect(progressService.fail).toHaveBeenCalled();
    expect(performer.start).toHaveBeenCalledTimes(1);
  });
});

describe('RestorePerformer server flow: clean-up', () => {
  it('removes the sidecar even when the temp admin cannot be removed', async () => {
    const tmpDir = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmpDir, 'backup.sql'), '-- sql');
      const archivePath = path.join(tmpDir, 'backup.tar');
      const { execSync } = await import('node:child_process');
      execSync(`tar -cf ${archivePath} -C ${tmpDir} backup.sql`);
      const sqlService = makeMockSqlService('mysql');
      sqlService.cleanUpDirectusUser.mockImplementation(async () => {
        throw new Error('cannot exec into a container in a completed pod');
      });
      const { performer, containerService } = buildPerformer(sqlService);

      await performer.restore(archivePath);

      expect(containerService.cleanUp).toHaveBeenCalledTimes(1);
    } finally {
      cleanTempDir(tmpDir);
    }
  });
});
