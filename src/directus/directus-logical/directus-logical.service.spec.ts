import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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
