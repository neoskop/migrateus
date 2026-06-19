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

const mockSchemaDiff = jest.fn((snapshot: unknown, force?: boolean) => ({
  __cmd: 'schemaDiff',
  snapshot,
  force,
}));
const mockSchemaApply = jest.fn((diff: unknown) => ({ __cmd: 'schemaApply', diff }));

const actualSdk = await import('@directus/sdk');

jest.unstable_mockModule('@directus/sdk', () => ({
  ...actualSdk,
  schemaDiff: mockSchemaDiff,
  schemaApply: mockSchemaApply,
}));

const mockPlanImportOrder = jest.fn<(collections: string[], relations: unknown[]) => unknown>();

jest.unstable_mockModule('../transfer/import-order.js', () => ({
  planImportOrder: mockPlanImportOrder,
}));

const { LogicalRestorePerformer } = await import('./logical-restore.performer.js');

const mockWriteFile = jest.spyOn(fs.promises, 'writeFile');
const mockReadFile = jest.spyOn(fs.promises, 'readFile');
const mockAccess = jest.spyOn(fs.promises, 'access');

const SYSTEM_COLLECTIONS = [
  'directus_roles',
  'directus_policies',
  'directus_permissions',
  'directus_access',
  'directus_users',
  'directus_settings',
];

const SNAPSHOT = {
  version: 1,
  directus: '11.0.0',
  vendor: 'postgres',
  collections: [
    { collection: 'articles' },
    { collection: 'authors' },
    { collection: 'directus_files' },
  ],
  fields: [],
  relations: [
    { collection: 'articles', field: 'author', related_collection: 'authors' },
  ],
};

const META = {
  format: 'logical',
  version: '11.0.0',
  sourceClient: 'pg',
  timestamp: '2026-01-01T00:00:00.000Z',
};

// Files present on disk after extraction.
const DATA: Record<string, any[]> = {
  'directus_roles.json': [{ id: 'role-1' }],
  'directus_users.json': [{ id: 'user-1', role: 'role-1' }],
  'directus_settings.json': [{ project_name: 'Demo' }],
  'authors.json': [{ id: 'a-1' }],
  'articles.json': [{ id: 'art-1', author: 'a-1' }],
};

function build(opts: { noAssets?: boolean; force?: boolean; platform?: string } = {}) {
  const { noAssets = false, force = false, platform = 'docker-compose' } = opts;

  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const fakeClient = { request: jest.fn(async () => ({ status: 200 })) } as any;

  const directusLogicalService = {
    importCollection: jest.fn(async () => undefined) as AnyMock,
  };

  const directusAssetService = {
    restoreAssets: jest.fn(async () => 0) as AnyMock,
  };

  const directusVersionService = {
    getVersion: jest.fn(async () => '11.0.0') as AnyMock,
    isDangerousMismatch: jest.fn(() => false) as AnyMock,
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
    restartDirectus: jest.fn(async () => undefined) as AnyMock,
  };
  const k8sService = {
    setup: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
    restartDirectus: jest.fn(async () => undefined) as AnyMock,
  };
  const acaService = {
    setup: jest.fn(async () => undefined) as AnyMock,
    restartDirectus: jest.fn(async () => undefined) as AnyMock,
  };
  const portForwardService = {
    forward: jest.fn(async () => 12345) as AnyMock,
    stop: jest.fn(),
  };

  const config = { noAssets, force, logical: true };
  const progressService = {
    advance: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    finish: jest.fn(),
    updateText: jest.fn(),
    warn: jest.fn(),
  };
  const environmentService = { environment: { platform } };

  const performer = new LogicalRestorePerformer(
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
    fakeClient,
    directusLogicalService,
    directusAssetService,
    directusVersionService,
    directusService,
    directusUserService,
    sqlService,
    dockerService,
    dockerContainerService,
    k8sService,
    acaService,
    portForwardService,
    progressService,
    config,
  };
}

describe('LogicalRestorePerformer.restore (docker)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDirSync.mockReturnValue({ name: '/tmp/migrateus-restore' });
    mockWriteFile.mockResolvedValue(undefined as never);
    mockExec.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

    // Every data file in DATA exists; everything else (e.g. unwritten collections) is absent.
    mockAccess.mockImplementation(async (p: any) => {
      const path = String(p);
      if (path.endsWith('meta.json') || path.endsWith('snapshot.json')) return undefined as never;
      const base = path.split('/').pop()!;
      if (base in DATA) return undefined as never;
      throw new Error('ENOENT');
    });

    mockReadFile.mockImplementation(async (p: any) => {
      const path = String(p);
      if (path.endsWith('meta.json')) return JSON.stringify(META) as never;
      if (path.endsWith('snapshot.json')) return JSON.stringify(SNAPSHOT) as never;
      const base = path.split('/').pop()!;
      if (base in DATA) return JSON.stringify(DATA[base]) as never;
      throw new Error(`ENOENT: ${path}`);
    });

    // The planner orders authors before articles and defers nothing for this set;
    // system collections come first, then user collections in dependency order.
    mockPlanImportOrder.mockReturnValue({
      order: [
        'directus_roles',
        'directus_policies',
        'directus_permissions',
        'directus_access',
        'directus_users',
        'directus_settings',
        'authors',
        'articles',
      ],
      deferredFields: { directus_roles: ['parent'] },
    });
  });

  it('extracts the archive into a temp dir before reading metadata', async () => {
    const { performer } = build();
    await performer.restore('backup.tgz', 'docker-env');
    const tarCall = mockExec.mock.calls.find((c) => (c[0] as string).startsWith('tar -xf'));
    expect(tarCall).toBeDefined();
    expect(tarCall![0]).toContain('backup.tgz');
    expect(tarCall![0]).toContain('/tmp/migrateus-restore');
  });

  it('creates and cleans up the temporary Directus admin', async () => {
    const { performer, sqlService, dockerContainerService } = build();
    await performer.restore('backup.tgz', 'docker-env');
    expect(sqlService.setupDirectusUser).toHaveBeenCalledTimes(1);
    expect(sqlService.setupDirectusUser).toHaveBeenCalledWith(dockerContainerService, 8055);
    expect(sqlService.cleanUpDirectusUser).toHaveBeenCalledTimes(1);
  });

  it('builds the SDK client from the temp admin token', async () => {
    const { performer, directusService } = build();
    await performer.restore('backup.tgz', 'docker-env');
    expect(directusService.getClient).toHaveBeenCalledWith(8055, 'temp-admin-token');
  });

  it('applies the snapshot via schemaDiff (full diff) + schemaApply', async () => {
    const { performer, fakeClient } = build();
    await performer.restore('backup.tgz', 'docker-env');

    expect(mockSchemaDiff).toHaveBeenCalledWith(SNAPSHOT, true);
    expect(mockSchemaApply).toHaveBeenCalledTimes(1);
    // schemaApply receives the diff produced by the schemaDiff request
    const applyArg = mockSchemaApply.mock.calls[0][0];
    expect(applyArg).toBeDefined();
    // both commands were dispatched through the client
    const dispatched = fakeClient.request.mock.calls.map((c: any[]) => (c[0] as any)?.__cmd);
    expect(dispatched).toContain('schemaDiff');
    expect(dispatched).toContain('schemaApply');
  });

  it('skips schemaApply when the diff reports no changes (204)', async () => {
    const { performer, fakeClient } = build();
    fakeClient.request.mockImplementation(async (cmd: any) => {
      if (cmd?.__cmd === 'schemaDiff') return { status: 204 };
      return { status: 200 };
    });
    await performer.restore('backup.tgz', 'docker-env');
    expect(mockSchemaApply).not.toHaveBeenCalled();
  });

  it('plans the import order from SYSTEM_COLLECTIONS + user collections and the system relations', async () => {
    const { performer } = build();
    await performer.restore('backup.tgz', 'docker-env');

    expect(mockPlanImportOrder).toHaveBeenCalledTimes(1);
    const [collections, relations] = mockPlanImportOrder.mock.calls[0] as [string[], any[]];

    for (const c of SYSTEM_COLLECTIONS) {
      expect(collections).toContain(c);
    }
    expect(collections).toContain('articles');
    expect(collections).toContain('authors');
    // directus_files came from the snapshot but is NOT a user collection
    expect(collections).not.toContain('directus_files');

    // snapshot relations are forwarded
    expect(relations).toContainEqual(
      expect.objectContaining({ collection: 'articles', relatedCollection: 'authors' }),
    );

    // hardcoded SYSTEM_RELATIONS for the system FKs
    expect(relations).toContainEqual(
      expect.objectContaining({
        collection: 'directus_users',
        field: 'role',
        relatedCollection: 'directus_roles',
      }),
    );
    expect(relations).toContainEqual(
      expect.objectContaining({
        collection: 'directus_access',
        field: 'policy',
        relatedCollection: 'directus_policies',
      }),
    );
    expect(relations).toContainEqual(
      expect.objectContaining({
        collection: 'directus_roles',
        field: 'parent',
        relatedCollection: 'directus_roles',
      }),
    );
  });

  it('imports each collection that has a data file, in planned order, with the right deferred fields', async () => {
    const { performer, directusLogicalService, fakeClient } = build();
    await performer.restore('backup.tgz', 'docker-env');

    const importedOrder = directusLogicalService.importCollection.mock.calls.map((c) => c[1]);
    // Only collections with data files present are imported (directus_policies/permissions/access have none).
    expect(importedOrder).toEqual([
      'directus_roles',
      'directus_users',
      'directus_settings',
      'authors',
      'articles',
    ]);

    // each call gets (client, collection, rows, deferredFields)
    const rolesCall = directusLogicalService.importCollection.mock.calls.find(
      (c) => c[1] === 'directus_roles',
    );
    expect(rolesCall![0]).toBe(fakeClient);
    expect(rolesCall![2]).toEqual(DATA['directus_roles.json']);
    expect(rolesCall![3]).toEqual(['parent']);

    // collections with no deferred fields get an empty array
    const authorsCall = directusLogicalService.importCollection.mock.calls.find(
      (c) => c[1] === 'authors',
    );
    expect(authorsCall![3]).toEqual([]);
  });

  it('restores assets when --no-assets is not set', async () => {
    const { performer, directusAssetService } = build({ noAssets: false });
    await performer.restore('backup.tgz', 'docker-env');
    expect(directusAssetService.restoreAssets).toHaveBeenCalledTimes(1);
    expect(directusAssetService.restoreAssets).toHaveBeenCalledWith(
      8055,
      '/tmp/migrateus-restore',
      expect.any(Function),
    );
  });

  it('skips asset restore when --no-assets is set', async () => {
    const { performer, directusAssetService } = build({ noAssets: true });
    await performer.restore('backup.tgz', 'docker-env');
    expect(directusAssetService.restoreAssets).not.toHaveBeenCalled();
  });

  it('checks the Directus version unless --force is set', async () => {
    const { performer, directusVersionService } = build({ force: false });
    await performer.restore('backup.tgz', 'docker-env');
    expect(directusVersionService.getVersion).toHaveBeenCalled();
  });

  it('skips the version check when --force is set', async () => {
    const { performer, directusVersionService } = build({ force: true });
    await performer.restore('backup.tgz', 'docker-env');
    expect(directusVersionService.getVersion).not.toHaveBeenCalled();
  });

  it('restarts Directus so it picks up the imported data', async () => {
    const { performer, dockerService } = build();
    await performer.restore('backup.tgz', 'docker-env');
    expect(dockerService.restartDirectus).toHaveBeenCalledTimes(1);
  });

  it('cleans up even when import fails', async () => {
    const { performer, directusLogicalService, sqlService, progressService } = build();
    directusLogicalService.importCollection.mockRejectedValueOnce(new Error('boom') as never);
    await performer.restore('backup.tgz', 'docker-env');
    expect(progressService.fail).toHaveBeenCalled();
    expect(sqlService.cleanUpDirectusUser).toHaveBeenCalledTimes(1);
  });
});

describe('LogicalRestorePerformer.restore (k8s)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDirSync.mockReturnValue({ name: '/tmp/migrateus-restore' });
    mockWriteFile.mockResolvedValue(undefined as never);
    mockExec.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mockAccess.mockImplementation(async (p: any) => {
      const path = String(p);
      if (path.endsWith('meta.json') || path.endsWith('snapshot.json')) return undefined as never;
      const base = path.split('/').pop()!;
      if (base in DATA) return undefined as never;
      throw new Error('ENOENT');
    });
    mockReadFile.mockImplementation(async (p: any) => {
      const path = String(p);
      if (path.endsWith('meta.json')) return JSON.stringify(META) as never;
      if (path.endsWith('snapshot.json')) return JSON.stringify(SNAPSHOT) as never;
      const base = path.split('/').pop()!;
      if (base in DATA) return JSON.stringify(DATA[base]) as never;
      throw new Error(`ENOENT: ${path}`);
    });
    mockPlanImportOrder.mockReturnValue({ order: [], deferredFields: {} });
  });

  it('forwards a port and cleans up the k8s platform', async () => {
    const { performer, portForwardService, k8sService, sqlService } = build({ platform: 'k8s' });
    await performer.restore('backup.tgz', 'k8s-env');
    expect(k8sService.setup).toHaveBeenCalledTimes(1);
    expect(portForwardService.forward).toHaveBeenCalledTimes(1);
    expect(sqlService.setupDirectusUser).toHaveBeenCalledWith(expect.anything(), 12345);
    expect(portForwardService.stop).toHaveBeenCalledTimes(1);
    expect(k8sService.cleanUp).toHaveBeenCalledTimes(1);
    expect(k8sService.restartDirectus).toHaveBeenCalledTimes(1);
  });
});
