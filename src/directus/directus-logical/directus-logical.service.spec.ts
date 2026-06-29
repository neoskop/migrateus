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

  it('wraps a user singleton (object response, not an array) in a one-element array', async () => {
    // A singleton user collection returns a single object from /items/<c>,
    // which must not be spread as if it were an array.
    const singleton = { id: 1, value: 'only-row' };
    const client = makeClient(async () => singleton);

    const result = await service.exportCollection(client as never, 'theo_chat_response_description');

    expect(result).toEqual([singleton]);
    // No pagination for a singleton object.
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when a singleton response is null', async () => {
    const client = makeClient(async () => null);

    const result = await service.exportCollection(client as never, 'theo_singleton_empty');

    expect(result).toEqual([]);
    expect(client.request).toHaveBeenCalledTimes(1);
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

describe('DirectusLogicalService.importCollection — json field encoding', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('JSON-encodes string values of json fields (regression: invalid input syntax for type json)', async () => {
    let captured: any;
    const client = {
      request: jest.fn(async (cmd: () => any) => {
        captured = cmd();
        return [];
      }),
    };
    const rows = [
      { id: 1, result: 'plain: not-json\n  text', args: { a: 1 } },
    ];

    await service.importCollection(
      client as never,
      'theo_chat_log_tool_usage',
      rows,
      [],
      [],
      false,
      ['result', 'args'],
    );

    const sent = JSON.parse(captured.body)[0];
    // The free-text string is wrapped into a JSON string literal...
    expect(sent.result).toBe(JSON.stringify('plain: not-json\n  text'));
    // ...while a non-string (object) json value is left for Directus to encode.
    expect(sent.args).toEqual({ a: 1 });
  });
});

describe('DirectusLogicalService.importCollection — directus_permissions license gate', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  const RESTRICTED = 'custom_permission_rules_enabled is a restricted resource.';

  it('retries per-row when a batch is rejected, skipping only the restricted rows', async () => {
    const rows = [
      { id: 1, collection: 'a', action: 'read', policy: 'p1', fields: ['*'] },
      { id: 2, collection: 'theo_setting', action: 'update', policy: 'p2', fields: ['x'] },
      { id: 3, collection: 'b', action: 'read', policy: 'p3', fields: ['*'] },
    ];

    const client = makeClient(async (cmd) => {
      const { body } = descriptor(cmd) as { body: string };
      const payload = JSON.parse(body) as any[];
      // Directus rejects the whole batch for containing a restricted row...
      if (payload.length > 1) {
        throw new Error(RESTRICTED);
      }
      // ...and on per-row retry rejects only the field-restricted row.
      if (payload[0].fields && payload[0].fields[0] !== '*') {
        throw new Error(`Field validation: ${RESTRICTED}`);
      }
      return [payload[0]];
    });

    const skipped = await service.importCollection(
      client as never,
      'directus_permissions',
      rows,
      [],
    );

    // The one field-restricted permission is reported, keyed by collection with
    // a human detail string (the auto-id strategy drops its numeric id).
    expect(skipped).toEqual([
      {
        collection: 'directus_permissions',
        detail: 'theo_setting.update (policy p2)',
      },
    ]);
    // 1 failed batch + 3 per-row retries.
    expect(client.request).toHaveBeenCalledTimes(4);
  });

  it('re-throws a non-license error instead of skipping', async () => {
    const rows = [{ id: 1, collection: 'a', action: 'read', policy: 'p1' }];
    const client = makeClient(async () => {
      throw new Error('Bad Request: something else');
    });

    await expect(
      service.importCollection(client as never, 'directus_permissions', rows, []),
    ).rejects.toThrow(/something else/);
  });
});

describe('DirectusLogicalService.importCollection — directus_access seat limit', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('skips access grants that exceed the target seat cap, importing the rest', async () => {
    // directus_access uses skip-existing: the first request is the read of
    // existing rows (none here), then the create batch, then per-row retries.
    const rows = [
      { id: 'a1', role: 'r1', user: null, policy: 'p1' },
      { id: 'a2', role: 'r2', user: null, policy: 'p2' },
    ];

    const client = {
      request: jest.fn(async (cmd: () => any) => {
        const desc = cmd();
        // First call: read existing access rows (GET) — return none.
        if (desc.method === 'GET') {
          return [];
        }
        const payload = JSON.parse(desc.body);
        // The create batch (2 rows) is rejected for exceeding the seat cap.
        if (payload.length > 1) {
          throw new Error('seats limit exceeded.');
        }
        // On retry, only the second grant pushes past the cap.
        if (payload[0].policy === 'p2') {
          throw new Error('seats limit exceeded.');
        }
        return [payload[0]];
      }),
    };

    const skipped = await service.importCollection(
      client as never,
      'directus_access',
      rows,
      [],
    );

    expect(skipped).toEqual([
      { collection: 'directus_access', detail: 'policy p2 → role r2' },
    ]);
  });
});

describe('DirectusLogicalService.importCollection — batching', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('splits a large insert into batches of 100 (regression: request entity too large)', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, n: i }));

    await service.importCollection(client as never, 'articles', rows, []);

    // 250 rows → ceil(250/100) = 3 create requests.
    expect(client.request).toHaveBeenCalledTimes(3);
  });
});

describe('DirectusLogicalService.importCollection — user singleton', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('upserts via updateSingleton (no /items POST route) when isSingleton is true', async () => {
    let captured: any;
    const client = {
      request: jest.fn(async (cmd: () => any) => {
        captured = cmd();
        return {};
      }),
    };
    const rows = [{ id: 1, text: 'only-row' }];

    await service.importCollection(
      client as never,
      'theo_chat_response_description',
      rows,
      [],
      [],
      true,
    );

    // Exactly one request, to the singleton item route via PATCH (no POST list route).
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(captured.path).toBe('/items/theo_chat_response_description');
    expect(captured.method).toBe('PATCH');
  });
});

describe('DirectusLogicalService.importCollection — strips relational alias fields', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('removes caller-supplied alias fields (user O2M/M2A) before insert', async () => {
    let captured: any;
    const client = {
      request: jest.fn(async (cmd: () => any) => {
        captured = cmd();
        return [];
      }),
    };
    const rows = [{ id: 1, title: 'A', turns: [10, 11], tool_usages: [5] }];

    await service.importCollection(
      client as never,
      'theo_chat_log',
      rows,
      [],
      ['turns', 'tool_usages'],
    );

    const sent = JSON.parse(captured.body);
    expect(sent[0]).toEqual({ id: 1, title: 'A' });
  });

  it('strips caller-supplied masked fields (hash/conceal special) before insert — they cannot round-trip the /items API', async () => {
    let captured: any;
    const client = {
      request: jest.fn(async (cmd: () => any) => {
        captured = cmd();
        return [];
      }),
    };
    const rows = [
      { id: 1, email: 'a@b.de', password: '$argon2id$v=19$m=65536$abc', secret: 'shh' },
    ];

    await service.importCollection(
      client as never,
      'theo_app_user',
      rows,
      [],
      [],
      false,
      [],
      ['password', 'secret'],
    );

    const sent = JSON.parse(captured.body);
    expect(sent[0]).toEqual({ id: 1, email: 'a@b.de' });
  });

  it('does NOT strip a non-masked field whose value merely looks like a hash', async () => {
    let captured: any;
    const client = {
      request: jest.fn(async (cmd: () => any) => {
        captured = cmd();
        return [];
      }),
    };
    const rows = [{ id: 1, note: '$argon2id$looks-like-a-hash-but-isnt' }];

    await service.importCollection(
      client as never,
      'articles',
      rows,
      [],
      [],
      false,
      [],
      [],
    );

    const sent = JSON.parse(captured.body);
    expect(sent[0]).toEqual({ id: 1, note: '$argon2id$looks-like-a-hash-but-isnt' });
  });

  it('strips known system alias fields on directus_policies automatically (regression: POST /policies 403)', async () => {
    let captured: any;
    const client = {
      request: jest.fn(async (cmd: () => any) => {
        captured = cmd();
        return [];
      }),
    };
    const rows = [
      {
        id: 'p1',
        name: 'Chatbot',
        admin_access: false,
        app_access: false,
        permissions: [89, 90],
        users: ['u1'],
        roles: ['r1'],
      },
    ];

    await service.importCollection(client as never, 'directus_policies', rows, []);

    const sent = JSON.parse(captured.body);
    expect(sent[0]).toEqual({
      id: 'p1',
      name: 'Chatbot',
      admin_access: false,
      app_access: false,
    });
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

    // skip-existing reads existing ids first (returns none here), then creates.
    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[1][0])).toEqual(descriptor(createRoles(rows)));
  });

  it('uses updateRole for the deferred-fields patch pass on directus_roles', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'role-1', parent: null }, { id: 'role-2', parent: 'role-1' }];

    await service.importCollection(client as never, 'directus_roles', rows, ['parent']);

    // calls: [0] read existing ids, [1] createRoles, [2] updateRole patch.
    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[2][0])).toEqual(descriptor(updateRole('role-2' as never, { parent: 'role-1' })));
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

    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[1][0])).toEqual(descriptor(createUsers(rows)));
  });

  it('strips masked password/token/tfa_secret fields on import (regression: token unique collision)', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [
      {
        id: 'user-1',
        email: 'a@b.com',
        password: '**********',
        token: '**********',
        tfa_secret: '**********',
      },
    ];

    await service.importCollection(client as never, 'directus_users', rows, []);

    // calls[0] reads existing ids; calls[1] is the create with masked fields gone.
    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[1][0])).toEqual(
      descriptor(createUsers([{ id: 'user-1', email: 'a@b.com' }] as never)),
    );
  });

  it('uses updateUser for the deferred-fields patch pass on directus_users', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'u1', role: null }, { id: 'u2', role: 'r1' }];

    await service.importCollection(client as never, 'directus_users', rows, ['role']);

    // calls: [0] read existing ids, [1] createUsers, [2] updateUser patch.
    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[2][0])).toEqual(descriptor(updateUser('u2' as never, { role: 'r1' })));
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

    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[1][0])).toEqual(descriptor(createPolicies(rows)));
  });

  it('uses updatePolicy for the deferred-fields patch pass on directus_policies', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 'p1', parent: null }, { id: 'p2', parent: 'p1' }];

    await service.importCollection(client as never, 'directus_policies', rows, ['parent']);

    // calls: [0] read existing ids, [1] createPolicies, [2] updatePolicy patch.
    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    expect(descriptor(calls[2][0])).toEqual(descriptor(updatePolicy('p2' as never, { parent: 'p1' })));
  });
});

describe('DirectusLogicalService.importCollection — directus_permissions (system collection)', () => {
  let service: DirectusLogicalService;

  beforeEach(() => {
    service = new DirectusLogicalService();
  });

  it('drops the auto-increment id and routes through createPermissions for insert', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [{ id: 1, collection: 'articles', action: 'read', policy: 'pol-1' }];

    await service.importCollection(client as never, 'directus_permissions', rows, []);

    // auto-id: id is dropped so the target assigns a fresh one; the policy FK
    // (not the integer id) preserves the link. No existing-id read, no patch.
    expect(client.request).toHaveBeenCalledTimes(1);
    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    expect(descriptor(actualCmd)).toEqual(
      descriptor(
        createPermissions([
          { collection: 'articles', action: 'read', policy: 'pol-1' },
        ] as never),
      ),
    );
  });

  it('skips global baseline permissions with a null policy (Directus seeds them itself)', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [
      { id: 1, collection: 'directus_users', action: 'read', policy: null },
      { id: 2, collection: 'articles', action: 'read', policy: 'pol-1' },
    ];

    await service.importCollection(client as never, 'directus_permissions', rows, []);

    const [actualCmd] = (client.request as jest.MockedFunction<typeof client.request>).mock.calls[0];
    // Only the policy-attached permission is created; the null-policy one is dropped.
    expect(descriptor(actualCmd)).toEqual(
      descriptor(
        createPermissions([
          { collection: 'articles', action: 'read', policy: 'pol-1' },
        ] as never),
      ),
    );
  });

  it('imports permissions in a single request: no existing-id read, no patch pass', async () => {
    const client = { request: jest.fn(async () => []) };
    const rows = [
      { id: 1, collection: 'a', action: 'read', policy: 'pol-1' },
      { id: 2, collection: 'b', action: 'read', policy: 'pol-2' },
    ];

    await service.importCollection(client as never, 'directus_permissions', rows, []);

    // auto-id: just the create (policies are imported before permissions, so the
    // policy FK is satisfied at insert and never deferred).
    expect(client.request).toHaveBeenCalledTimes(1);
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

    // skip-existing: calls[0] reads existing ids (GET /access), calls[1] inserts.
    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    const desc = descriptor(calls[1][0]) as Record<string, unknown>;
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

    // calls[1] is the POST insert (calls[0] read existing ids).
    const calls = (client.request as jest.MockedFunction<typeof client.request>).mock.calls;
    const desc = descriptor(calls[1][0]) as Record<string, unknown>;
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
