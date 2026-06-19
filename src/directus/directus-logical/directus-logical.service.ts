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
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    // Pass 1 — insert rows with deferred fields nulled out
    const pass1Rows = rows.map((row) => {
      if (deferredFields.length === 0) {
        return row;
      }
      const copy = { ...row };
      for (const field of deferredFields) {
        copy[field] = null;
      }
      return copy;
    });

    if (collection === 'directus_settings') {
      // Settings is a singleton — always update
      await client.request(updateSettings(pass1Rows[0]));
    } else {
      await client.request(this.buildCreateCommand(collection, pass1Rows));
    }

    // Pass 2 — patch back deferred fields for rows that had non-null values
    if (deferredFields.length > 0) {
      for (const row of rows) {
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
