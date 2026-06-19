import { Injectable } from '@nestjs/common';
import {
  createItems,
  createPermissions,
  createPolicies,
  createRoles,
  createUsers,
  readItems,
  readPermissions,
  readPolicies,
  readRoles,
  readSettings,
  readUsers,
  schemaSnapshot,
  SchemaSnapshotOutput,
  updateItem,
  updatePermission,
  updatePolicy,
  updateRole,
  updateSettings,
  updateSingleton,
  updateUser,
} from '@directus/sdk';

export const SYSTEM_COLLECTIONS = [
  'directus_roles',
  'directus_policies',
  'directus_permissions',
  'directus_access',
  'directus_users',
  'directus_settings',
] as const;

type SystemCollection = (typeof SYSTEM_COLLECTIONS)[number];

const LIMIT = 200;

// Insert rows in batches so a large collection doesn't exceed the target's
// request body limit ("request entity too large"). Flush on whichever comes
// first: the row count or the serialized byte size (rows vary wildly in size).
const IMPORT_BATCH_SIZE = 100;
const MAX_BATCH_BYTES = 500_000;

/**
 * Reverse/relational alias fields on the carried system collections. These are
 * not real columns — they are O2M/M2A aliases reconstructed from the FK side
 * (directus_permissions.policy, directus_access, directus_users.role). Directus
 * rejects writing them on create with 403, so they must be stripped on import.
 */
const SYSTEM_ALIAS_FIELDS: Record<string, string[]> = {
  directus_policies: ['permissions', 'users', 'roles'],
  directus_roles: ['users', 'policies', 'children'],
  directus_users: ['policies'],
};

/**
 * Fields the Directus API masks as '**********' on read. The masked value is
 * unusable on import, and `token` carries a UNIQUE constraint so the shared
 * mask collides across users. Strip them — affected users must reset their
 * password / re-issue tokens / re-enrol TFA (a documented logical limitation).
 */
const MASKED_FIELDS: Record<string, string[]> = {
  directus_users: ['password', 'token', 'tfa_secret'],
};

/**
 * How to reconcile primary-key conflicts when importing carried system
 * collections into a target that already has Directus' bootstrap rows.
 *
 * - 'auto-id': drop the source id and let the target assign one.
 *   `directus_permissions` uses auto-increment integer ids that overlap the
 *   target's default permissions; the `policy` FK preserves the relationship.
 * - 'skip-existing': keep the source id but skip rows whose id already exists.
 *   Directus' Public policy and its access row use fixed ids present on every
 *   install, so re-inserting them collides.
 *
 * User collections (fresh target, empty tables) keep their ids and insert as-is.
 */
const ID_CONFLICT_STRATEGY: Record<string, 'auto-id' | 'skip-existing'> = {
  directus_permissions: 'auto-id',
  directus_policies: 'skip-existing',
  directus_roles: 'skip-existing',
  directus_users: 'skip-existing',
  directus_access: 'skip-existing',
};

@Injectable()
export class DirectusLogicalService {
  async exportSchema(client: { request: (cmd: unknown) => Promise<unknown> }): Promise<SchemaSnapshotOutput> {
    return client.request(schemaSnapshot()) as Promise<SchemaSnapshotOutput>;
  }

  async importCollection(
    client: { request: (cmd: unknown) => Promise<unknown> },
    collection: string,
    rows: any[],
    deferredFields: string[],
    aliasFields: string[] = [],
    isSingleton = false,
    jsonFields: string[] = [],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    // Relational alias fields (O2M/M2A/presentation) are not real columns and
    // Directus rejects them on write — strip them. System-collection aliases
    // are known here; user-collection aliases are supplied by the caller from
    // the snapshot (fields with a null schema).
    const stripFields = new Set([
      ...(SYSTEM_ALIAS_FIELDS[collection] ?? []),
      ...(MASKED_FIELDS[collection] ?? []),
      ...aliasFields,
    ]);

    // Pass 1 — strip aliases, normalize json fields, null deferred back-edges
    const pass1Rows = rows.map((row) => {
      const copy = { ...row };
      for (const field of stripFields) {
        delete copy[field];
      }
      // SQLite allows non-JSON text in json columns; Postgres does not. A
      // string value of a json field must be a JSON string literal to be valid
      // json — encode it (this round-trips back to the same string on read).
      for (const field of jsonFields) {
        if (typeof copy[field] === 'string') {
          copy[field] = JSON.stringify(copy[field]);
        }
      }
      for (const field of deferredFields) {
        copy[field] = null;
      }
      return copy;
    });

    if (collection === 'directus_settings') {
      // Settings is a singleton — always update
      await client.request(updateSettings(pass1Rows[0]));
      return;
    }

    if (isSingleton) {
      // User singleton collections have no /items POST route; upsert the row.
      await client.request(updateSingleton(collection as never, pass1Rows[0]));
      return;
    }

    // Directus seeds global baseline permissions (policy === null) on every
    // install; they cannot be created via the API and the target already has
    // them from its own bootstrap. Drop them.
    const sourceRows =
      collection === 'directus_permissions'
        ? pass1Rows.filter((row) => row.policy != null)
        : pass1Rows;

    // Reconcile id conflicts with the target's bootstrap rows.
    const strategy = ID_CONFLICT_STRATEGY[collection];
    let rowsToCreate = sourceRows;
    let createdIds: Set<unknown> | null = null;

    if (strategy === 'auto-id') {
      rowsToCreate = sourceRows.map((row) => {
        const { id: _id, ...rest } = row;
        return rest;
      });
    } else if (strategy === 'skip-existing') {
      const existing = new Set(
        (await this.exportCollection(client, collection)).map((r) => r.id),
      );
      rowsToCreate = sourceRows.filter((row) => !existing.has(row.id));
      createdIds = new Set(rowsToCreate.map((row) => row.id));
    }

    let batch: any[] = [];
    let batchBytes = 0;
    const flush = async () => {
      if (batch.length === 0) {
        return;
      }
      await client.request(this.buildCreateCommand(collection, batch));
      batch = [];
      batchBytes = 0;
    };
    for (const row of rowsToCreate) {
      const rowBytes = JSON.stringify(row).length;
      if (
        batch.length > 0 &&
        (batch.length >= IMPORT_BATCH_SIZE ||
          batchBytes + rowBytes > MAX_BATCH_BYTES)
      ) {
        await flush();
      }
      batch.push(row);
      batchBytes += rowBytes;
    }
    await flush();

    // Pass 2 — patch back deferred fields for rows we actually created.
    // Skipped for 'auto-id' (those rows have no stable id to address).
    if (deferredFields.length > 0 && strategy !== 'auto-id') {
      for (const row of rows) {
        if (createdIds && !createdIds.has(row.id)) {
          continue;
        }
        const patch: Record<string, unknown> = {};
        for (const field of deferredFields) {
          if (row[field] !== null && row[field] !== undefined) {
            patch[field] = row[field];
          }
        }
        if (Object.keys(patch).length > 0) {
          await client.request(this.buildUpdateCommand(collection, row.id, patch));
        }
      }
    }
  }

  private buildCreateCommand(collection: string, rows: any[]): unknown {
    switch (collection as SystemCollection) {
      case 'directus_roles':
        return createRoles(rows);
      case 'directus_policies':
        return createPolicies(rows);
      case 'directus_permissions':
        return createPermissions(rows);
      case 'directus_users':
        return createUsers(rows);
      case 'directus_access':
        return () => ({
          path: '/access',
          body: JSON.stringify(rows),
          method: 'POST',
        });
      default:
        return createItems(collection as never, rows as never[]);
    }
  }

  private buildUpdateCommand(collection: string, id: unknown, patch: Record<string, unknown>): unknown {
    switch (collection as SystemCollection) {
      case 'directus_roles':
        return updateRole(id as never, patch as never);
      case 'directus_policies':
        return updatePolicy(id as never, patch as never);
      case 'directus_permissions':
        return updatePermission(id as never, patch as never);
      case 'directus_users':
        return updateUser(id as never, patch as never);
      default:
        return updateItem(collection as never, id as never, patch as never);
    }
  }

  async exportCollection(
    client: { request: (cmd: unknown) => Promise<unknown> },
    collection: string,
  ): Promise<any[]> {
    // directus_settings is a singleton — return wrapped in array
    if (collection === 'directus_settings') {
      const settings = await client.request(readSettings());
      return [settings];
    }

    const results: any[] = [];
    let page = 1;

    while (true) {
      const query = { limit: LIMIT, page };
      let rows: any;

      switch (collection as SystemCollection) {
        case 'directus_roles':
          rows = await client.request(readRoles(query));
          break;
        case 'directus_policies':
          rows = await client.request(readPolicies(query));
          break;
        case 'directus_permissions':
          rows = await client.request(readPermissions(query));
          break;
        case 'directus_users':
          rows = await client.request(readUsers(query));
          break;
        case 'directus_access':
          rows = await client.request(() => ({
            path: '/access',
            params: { limit: LIMIT, offset: (page - 1) * LIMIT },
            method: 'GET',
          }));
          break;
        default:
          rows = await client.request(readItems(collection as never, query));
          break;
      }

      // A singleton user collection (meta.singleton) returns a single object
      // from /items/<c>, not an array — wrap it and stop (no pagination).
      if (!Array.isArray(rows)) {
        return rows == null ? [] : [rows];
      }

      results.push(...rows);

      if (rows.length < LIMIT) {
        break;
      }

      page += 1;
    }

    return results;
  }
}
