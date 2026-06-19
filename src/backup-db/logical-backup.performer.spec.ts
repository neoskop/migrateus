import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fs from 'node:fs';

type AnyMock = jest.Mock<any>;

const mockExec = jest.fn<
  (cmd: string, opts?: unknown) => Promise<{ code: number; stdout: string; stderr: string }>
>();

jest.unstable_mockModule('../util/exec.js', () => ({
  exec: mockExec,
}));

const mockDirSync = jest.fn<() => { name: string }>();

jest.unstable_mockModule('tmp', () => ({
  default: { dirSync: mockDirSync },
  dirSync: mockDirSync,
}));

const { LogicalBackupPerformer } = await import('./logical-backup.performer.js');

const mockMkdir = jest.spyOn(fs.promises, 'mkdir');
const mockWriteFile = jest.spyOn(fs.promises, 'writeFile');
const mockStat = jest.spyOn(fs.promises, 'stat');

const SYSTEM_COLLECTIONS = [
  'directus_roles',
  'directus_policies',
  'directus_permissions',
  'directus_access',
  'directus_users',
  'directus_settings',
];

function build(opts: { noAssets?: boolean; platform?: string } = {}) {
  const { noAssets = false, platform = 'docker-compose' } = opts;

  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const fakeClient = { request: jest.fn(async () => undefined) } as any;

  const snapshot = {
    version: 1,
    directus: '11.0.0',
    vendor: 'postgres',
    collections: [
      { collection: 'articles' },
      { collection: 'authors' },
      // directus_* entries in the snapshot must be skipped (covered by SYSTEM_COLLECTIONS)
      { collection: 'directus_files' },
    ],
    fields: [],
    relations: [],
  };

  const directusLogicalService = {
    exportSchema: jest.fn(async () => snapshot) as AnyMock,
    exportCollection: jest.fn(async (_client: unknown, collection: string) => [
      { id: `${collection}-1` },
    ]) as AnyMock,
  };

  const directusAssetService = {
    backupAssets: jest.fn(async () => []) as AnyMock,
  };

  const directusVersionService = {
    getVersion: jest.fn(async () => '11.0.0') as AnyMock,
  };

  const directusService = {
    getClient: jest.fn(() => fakeClient) as AnyMock,
  };

  const directusUserService = { token: 'temp-admin-token' };

  const sqlService = {
    client: 'pg' as const,
    setupDirectusUser: jest.fn(async () => undefined) as AnyMock,
    cleanUpDirectusUser: jest.fn(async () => undefined) as AnyMock,
  };

  const dockerContainerService = { execInDirectus: jest.fn() };
  const k8sContainerService = { execInDirectus: jest.fn() };
  const acaContainerService = { execInDirectus: jest.fn() };

  const dockerService = {
    setup: jest.fn(async () => undefined) as AnyMock,
    forwardDirectus: jest.fn(async () => 8055) as AnyMock,
    stopForwardDirectus: jest.fn() as AnyMock,
  };
  const k8sService = {
    setup: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
  };
  const acaService = { setup: jest.fn(async () => undefined) as AnyMock };
  const portForwardService = {
    forward: jest.fn(async () => 12345) as AnyMock,
    stop: jest.fn(),
  };

  const config = { noAssets, logical: true };
  const progressService = {
    advance: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    finish: jest.fn(),
    updateText: jest.fn(),
    warn: jest.fn(),
  };
  const environmentService = { environment: { platform } };

  const performer = new LogicalBackupPerformer(
    logger as never,
    dockerService as never,
    dockerContainerService as never,
    k8sService as never,
    k8sContainerService as never,
    portForwardService as never,
    acaService as never,
    acaContainerService as never,
    sqlService as never,
    directusLogicalService as never,
    directusAssetService as never,
    directusVersionService as never,
    directusService as never,
    directusUserService as never,
    config as never,
    progressService as never,
    environmentService as never,
  );

  return {
    performer,
    snapshot,
    fakeClient,
    directusLogicalService,
    directusAssetService,
    directusVersionService,
    directusService,
    directusUserService,
    sqlService,
    dockerService,
    dockerContainerService,
    progressService,
    config,
  };
}

function metaWrite() {
  return mockWriteFile.mock.calls.find(
    (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('meta.json'),
  );
}

describe('LogicalBackupPerformer.backup (docker)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDirSync.mockReturnValue({ name: '/tmp/migrateus-logical' });
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);
    mockStat.mockResolvedValue({ size: 2048 } as never);
    mockExec.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  });

  it('creates and cleans up the temporary Directus admin', async () => {
    const { performer, sqlService, dockerContainerService } = build();
    await performer.backup('docker-env', 'out.tgz');
    expect(sqlService.setupDirectusUser).toHaveBeenCalledTimes(1);
    expect(sqlService.setupDirectusUser).toHaveBeenCalledWith(
      dockerContainerService,
      8055,
    );
    expect(sqlService.cleanUpDirectusUser).toHaveBeenCalledTimes(1);
  });

  it('builds the SDK client from the temp admin token', async () => {
    const { performer, directusService } = build();
    await performer.backup('docker-env', 'out.tgz');
    expect(directusService.getClient).toHaveBeenCalledWith(8055, 'temp-admin-token');
  });

  it('exports the schema and writes snapshot.json', async () => {
    const { performer, directusLogicalService, snapshot } = build();
    await performer.backup('docker-env', 'out.tgz');
    expect(directusLogicalService.exportSchema).toHaveBeenCalledTimes(1);

    const snapshotWrite = mockWriteFile.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('snapshot.json'),
    );
    expect(snapshotWrite).toBeDefined();
    expect(JSON.parse(snapshotWrite![1] as string)).toEqual(snapshot);
  });

  it('exports each system collection plus the snapshot user collections (excluding directus_*)', async () => {
    const { performer, directusLogicalService } = build();
    await performer.backup('docker-env', 'out.tgz');

    const exported = directusLogicalService.exportCollection.mock.calls.map(
      (c) => c[1],
    );

    for (const c of SYSTEM_COLLECTIONS) {
      expect(exported).toContain(c);
    }
    expect(exported).toContain('articles');
    expect(exported).toContain('authors');
    // directus_files came from the snapshot but must NOT be exported as a user collection
    expect(exported).not.toContain('directus_files');
  });

  it('writes data/<collection>.json for every exported collection', async () => {
    const { performer } = build();
    await performer.backup('docker-env', 'out.tgz');

    const dataWrites = mockWriteFile.mock.calls
      .map((c) => c[0])
      .filter((p) => typeof p === 'string' && (p as string).includes('data/'));

    for (const c of [...SYSTEM_COLLECTIONS, 'articles', 'authors']) {
      expect(
        dataWrites.some((p) => (p as string).endsWith(`data/${c}.json`)),
      ).toBe(true);
    }
  });

  it('writes meta.json with format "logical", version, and sourceClient', async () => {
    const { performer } = build();
    await performer.backup('docker-env', 'out.tgz');

    const write = metaWrite();
    expect(write).toBeDefined();
    const meta = JSON.parse(write![1] as string);
    expect(meta).toHaveProperty('format', 'logical');
    expect(meta).toHaveProperty('version', '11.0.0');
    expect(meta).toHaveProperty('sourceClient', 'pg');
    expect(meta).toHaveProperty('timestamp');
  });

  it('backs up assets when --no-assets is not set', async () => {
    const { performer, directusAssetService } = build({ noAssets: false });
    await performer.backup('docker-env', 'out.tgz');
    expect(directusAssetService.backupAssets).toHaveBeenCalledTimes(1);
    expect(directusAssetService.backupAssets).toHaveBeenCalledWith(
      8055,
      '/tmp/migrateus-logical',
      expect.any(Function),
    );
  });

  it('skips asset backup when --no-assets is set', async () => {
    const { performer, directusAssetService } = build({ noAssets: true });
    await performer.backup('docker-env', 'out.tgz');
    expect(directusAssetService.backupAssets).not.toHaveBeenCalled();
  });

  it('tars the backup directory into the target file', async () => {
    const { performer } = build();
    await performer.backup('docker-env', 'out.tgz');
    const tarCall = mockExec.mock.calls.find((c) => (c[0] as string).startsWith('tar -czf'));
    expect(tarCall).toBeDefined();
    expect(tarCall![1]).toMatchObject({ cwd: '/tmp/migrateus-logical' });
  });

  it('performs platform setup before creating the temp admin', async () => {
    const { performer, dockerService, sqlService } = build();
    const order: string[] = [];
    dockerService.setup.mockImplementation(async () => {
      order.push('setup');
    });
    sqlService.setupDirectusUser.mockImplementation(async () => {
      order.push('user');
    });
    await performer.backup('docker-env', 'out.tgz');
    expect(order).toEqual(['setup', 'user']);
  });
});
