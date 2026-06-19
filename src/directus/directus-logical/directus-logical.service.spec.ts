import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  createItems,
  createRoles,
  createUsers,
  createPolicies,
  createPermissions,
  updateItem,
  updateRole,
  updateUser,
  updatePolicy,
  updatePermission,
  updateSettings,
} from '@directus/sdk';
import {
  DirectusLogicalService,
  SYSTEM_COLLECTIONS,
} from './directus-logical.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock client whose .request() resolves to whatever you give. */
function makeClient(handler: (cmd: () => unknown) => Promise<unknown>) {
  return { request: jest.fn((cmd: () => unknown) => handler(cmd)) };
}

/**
 * Call an SDK command function and return its descriptor object.
 * SDK commands are closures: `createRoles(rows)` returns `() => descriptor`.
 * Two calls produce different function references but identical descriptors.
 * Use this helper to compare by value rather than by reference.
 *
 * Note: some commands (e.g. createItems/updateItem for core collections like
 * directus_access) throw when called. Do not use this helper for those — use
 * descriptorUnsafe only where the command is known safe (user collections and
 * non-items SDK commands).
 */
function descriptor(cmd: unknown): unknown {
  return (cmd as () => unknown)();
}

/**
 * Build the expected HTTP descriptor for an /items/<collection> POST or PATCH
 * without going through the SDK guard that blocks core collections.
 * Used only for directus_access assertions.
 */
function itemsDescriptor(method: 'POST' | 'PATCH', collection: string, body: unknown, id?: unknown): object {
  const path = id !== undefined ? `/items/${collection}/${id}` : `/items/${collection}`;
  return { path, params: {}, body: JSON.stringify(body), method };
}

/**
 * Build a paginated-item handler.
 * The first `fullPages` calls return `pageSize` items; subsequent calls return
 * `trailingCount` items (simulating the last page).
 */
function paginatedHandler(opts: {
  fullPages: number;
  pageSize?: number;
  trailingCount: number;
}) {
  const { fullPages, pageSize = 200, trailingCount } = opts;
  let call = 0;
  return jest.fn(async (_cmd: () => unknown) => {
    const n = call < fullPages ? pageSize : trailingCount;
    call += 1;
    return Array.from({ length: n }, (_, i) => ({ id: `item-${call}-${i}` }));
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SYSTEM_COLLECTIONS constant', () => {
  it('contains exactly the six expected system collection names', () => {
    expect(SYSTEM_COLLECTIONS).toEqual([
      'directus_roles',
      'directus_policies',
      'directus_permissions',
      'directus_access',
      'directus_users',
      'directus_settings',
    ]);
  });

  it('has exactly 6 entries', () => {
    expect(SYSTEM_COLLECTIONS).toHaveLength(6);
  });
});

describe('DirectusLogicalService.exportSchema', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('calls client.request with the schemaSnapshot command and returns the result', async () => {
    const fakeSnapshot = {
      version: 1,
      collections: [{ collection: 'articles', meta: {} }],
      fields: [],
      relations: [],
    };
    const client = makeClient(async () => fakeSnapshot);

    const result = await service.exportSchema(client as never);

    expect(result).toBe(fakeSnapshot);
    expect(client.request).toHaveBeenCalledTimes(1);
  });
});

describe('DirectusLogicalService.exportCollection — user collection', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('returns all items across two full pages and one trailing page', async () => {
    const handler = paginatedHandler({ fullPages: 2, pageSize: 200, trailingCount: 42 });
    const client = { request: handler };

    const result = await service.exportCollection(client as never, 'theo_articles');

    // 200 + 200 + 42 = 442
    expect(result).toHaveLength(442);
    // Three requests were made (page 1, page 2, page 3 which was short)
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('returns an empty array when the first page returns 0 items', async () => {
    const client = makeClient(async () => []);

    const result = await service.exportCollection(client as never, 'empty_col');

    expect(result).toEqual([]);
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('returns exactly one page when a single page has fewer than limit items', async () => {
    const handler = paginatedHandler({ fullPages: 0, trailingCount: 5 });
    const client = { request: handler };

    const result = await service.exportCollection(client as never, 'small_col');

    expect(result).toHaveLength(5);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('continues paging until a short page terminates the loop (exactly at limit boundary)', async () => {
    // 3 full pages (200 each) + 1 item
    const handler = paginatedHandler({ fullPages: 3, pageSize: 200, trailingCount: 1 });
    const client = { request: handler };

    const result = await service.exportCollection(client as never, 'big_col');

    expect(result).toHaveLength(601);
    expect(handler).toHaveBeenCalledTimes(4);
  });
});

describe('DirectusLogicalService.exportCollection — directus_settings (singleton)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('wraps the singleton settings object in an array', async () => {
    const fakeSettings = { id: 1, project_name: 'Test' };
    const client = makeClient(async () => fakeSettings);

    const result = await service.exportCollection(client as never, 'directus_settings');

    expect(result).toEqual([fakeSettings]);
    expect(client.request).toHaveBeenCalledTimes(1);
  });
});

describe('DirectusLogicalService.exportCollection — system collections (paginated)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  const paginatedSystemCollections = [
    'directus_roles',
    'directus_policies',
    'directus_permissions',
    'directus_access',
    'directus_users',
  ] as const;

  for (const col of paginatedSystemCollections) {
    it(`paginates ${col} and returns all items`, async () => {
      const handler = paginatedHandler({ fullPages: 1, pageSize: 200, trailingCount: 3 });
      const client = { request: handler };

      const result = await service.exportCollection(client as never, col);

      expect(result).toHaveLength(203);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  }
});

// ---------------------------------------------------------------------------
// importCollection tests
// ---------------------------------------------------------------------------

describe('DirectusLogicalService.importCollection — empty rows', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('makes no requests when rows is empty', async () => {
    const client = { request: jest.fn() };
    await service.importCollection(client as never, 'articles', [], []);
    expect(client.request).not.toHaveBeenCalled();
  });
});

describe('DirectusLogicalService.importCollection — user collection, no deferred fields', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('inserts all rows in a single batch with no update pass', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' },
    ];

    await service.importCollection(client as never, 'articles', rows, []);

    // Exactly one call: the batch insert
    expect(client.request).toHaveBeenCalledTimes(1);
    // The call must have been made with createItems('articles', rows) — compare descriptors
    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    expect(descriptor(actualCmd)).toEqual(descriptor(createItems('articles' as never, rows)));
  });
});

describe('DirectusLogicalService.importCollection — user collection, with deferred fields', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('pass-1 nulls out parent for ALL rows; pass-2 only patches rows where parent is non-null', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [
      { id: 1, parent: null },
      { id: 2, parent: 1 },
    ];

    await service.importCollection(client as never, 'categories', rows, ['parent']);

    // 1 insert call + 1 update for row 2 (row 1 stays null — nothing to patch)
    expect(client.request).toHaveBeenCalledTimes(2);

    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;

    // Pass-1: both rows inserted with parent nulled
    const expectedInsert = [
      { id: 1, parent: null },
      { id: 2, parent: null },
    ];
    expect(descriptor(calls[0][0])).toEqual(descriptor(createItems('categories' as never, expectedInsert)));

    // Pass-2: only row 2 gets an update with the original parent value
    expect(descriptor(calls[1][0])).toEqual(descriptor(updateItem('categories' as never, 2, { parent: 1 })));
  });

  it('preserves id in the insert payload', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'abc-123', parent: null }, { id: 'def-456', parent: 'abc-123' }];

    await service.importCollection(client as never, 'nodes', rows, ['parent']);

    const firstCallArg = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0][0];
    // The insert command should be createItems with both ids — compare by descriptor
    expect(descriptor(firstCallArg)).toEqual(descriptor(createItems('nodes' as never, [
      { id: 'abc-123', parent: null },
      { id: 'def-456', parent: null },
    ])));
  });
});

describe('DirectusLogicalService.importCollection — directus_roles (system collection)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('routes through createRoles, not createItems, for insert', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'role-1', name: 'Admin' }];

    await service.importCollection(client as never, 'directus_roles', rows, []);

    expect(client.request).toHaveBeenCalledTimes(1);
    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    expect(descriptor(actualCmd)).toEqual(descriptor(createRoles(rows)));
  });

  it('uses updateRole for the deferred-fields patch pass on directus_roles', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'role-1', parent: null }, { id: 'role-2', parent: 'role-1' }];

    await service.importCollection(client as never, 'directus_roles', rows, ['parent']);

    expect(client.request).toHaveBeenCalledTimes(2);
    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[1][0])).toEqual(descriptor(updateRole('role-2' as never, { parent: 'role-1' })));
  });
});

describe('DirectusLogicalService.importCollection — directus_users (system collection)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('routes through createUsers for insert', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'user-1', email: 'a@b.com' }];

    await service.importCollection(client as never, 'directus_users', rows, []);

    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    expect(descriptor(actualCmd)).toEqual(descriptor(createUsers(rows)));
  });

  it('uses updateUser for the deferred-fields patch pass on directus_users', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'u1', role: null }, { id: 'u2', role: 'r1' }];

    await service.importCollection(client as never, 'directus_users', rows, ['role']);

    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[1][0])).toEqual(descriptor(updateUser('u2' as never, { role: 'r1' })));
  });
});

describe('DirectusLogicalService.importCollection — directus_policies (system collection)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('routes through createPolicies for insert', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'pol-1', name: 'P1' }];

    await service.importCollection(client as never, 'directus_policies', rows, []);

    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    expect(descriptor(actualCmd)).toEqual(descriptor(createPolicies(rows)));
  });

  it('uses updatePolicy for the deferred-fields patch pass on directus_policies', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'p1', parent: null }, { id: 'p2', parent: 'p1' }];

    await service.importCollection(client as never, 'directus_policies', rows, ['parent']);

    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[1][0])).toEqual(descriptor(updatePolicy('p2' as never, { parent: 'p1' })));
  });
});

describe('DirectusLogicalService.importCollection — directus_permissions (system collection)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('routes through createPermissions for insert', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 1, collection: 'articles', action: 'read' }];

    await service.importCollection(client as never, 'directus_permissions', rows, []);

    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    expect(descriptor(actualCmd)).toEqual(descriptor(createPermissions(rows)));
  });

  it('uses updatePermission for the deferred-fields patch pass on directus_permissions', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 1, policy: null }, { id: 2, policy: 'pol-1' }];

    await service.importCollection(client as never, 'directus_permissions', rows, ['policy']);

    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[1][0])).toEqual(descriptor(updatePermission(2 as never, { policy: 'pol-1' })));
  });
});

describe('DirectusLogicalService.exportCollection — directus_access (raw /access endpoint)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('uses a raw GET /access command (not readItems) for the first page', async () => {
    const client = makeClient(async (_cmd) => []);

    await service.exportCollection(client as never, 'directus_access');

    expect(client.request).toHaveBeenCalledTimes(1);
    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    const desc = descriptor(actualCmd) as Record<string, unknown>;
    expect(desc.path).toBe('/access');
    expect(desc.method).toBe('GET');
  });

  it('passes limit and offset params on the first page (page=1 → offset=0)', async () => {
    const client = makeClient(async (_cmd) => []);

    await service.exportCollection(client as never, 'directus_access');

    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    const desc = descriptor(actualCmd) as Record<string, unknown>;
    const params = desc.params as Record<string, unknown>;
    expect(params.limit).toBe(200);
    expect(params.offset).toBe(0);
  });

  it('advances offset on the second page', async () => {
    // First call returns a full page (200 rows), second returns partial (3 rows)
    let call = 0;
    const client = makeClient(async (_cmd) => {
      call += 1;
      if (call === 1) return Array.from({ length: 200 }, (_, i) => ({ id: `a${i}` }));
      return Array.from({ length: 3 }, (_, i) => ({ id: `b${i}` }));
    });

    const result = await service.exportCollection(client as never, 'directus_access');

    expect(result).toHaveLength(203);
    expect(client.request).toHaveBeenCalledTimes(2);
    const secondCallCmd = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[1][0];
    const desc = descriptor(secondCallCmd) as Record<string, unknown>;
    const params = desc.params as Record<string, unknown>;
    expect(params.offset).toBe(200);
  });

  it('paginates directus_access and returns all rows (1 full page + trailing)', async () => {
    const handler = paginatedHandler({ fullPages: 1, pageSize: 200, trailingCount: 7 });
    const client = { request: handler };

    const result = await service.exportCollection(client as never, 'directus_access');

    expect(result).toHaveLength(207);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('DirectusLogicalService.importCollection — directus_access (raw /access endpoint)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('uses a raw POST /access command (not createItems) for insert', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'acc-1', role: 'r1', policy: 'p1' }];

    await service.importCollection(client as never, 'directus_access', rows, []);

    expect(client.request).toHaveBeenCalledTimes(1);
    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    const desc = descriptor(actualCmd) as Record<string, unknown>;
    expect(desc.path).toBe('/access');
    expect(desc.method).toBe('POST');
  });

  it('sends the rows as a JSON body in the POST request', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [
      { id: 'acc-1', role: 'r1', user: null, policy: 'p1', sort: 1 },
      { id: 'acc-2', role: null, user: 'u1', policy: 'p2', sort: 2 },
    ];

    await service.importCollection(client as never, 'directus_access', rows, []);

    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    const desc = descriptor(actualCmd) as Record<string, unknown>;
    expect(desc.body).toBe(JSON.stringify(rows));
  });

  it('makes no requests when rows is empty (early return)', async () => {
    const client = { request: jest.fn() };

    await service.importCollection(client as never, 'directus_access', [], []);

    expect(client.request).not.toHaveBeenCalled();
  });
});

describe('DirectusLogicalService.importCollection — directus_settings (singleton)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('uses updateSettings instead of createItems for the settings singleton', async () => {
    const client = { request: jest.fn(async () => ({})) };
    const rows = [{ project_name: 'Test', project_url: 'https://example.com' }];

    await service.importCollection(client as never, 'directus_settings', rows, []);

    expect(client.request).toHaveBeenCalledTimes(1);
    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    expect(descriptor(actualCmd)).toEqual(descriptor(updateSettings(rows[0])));
  });
});
