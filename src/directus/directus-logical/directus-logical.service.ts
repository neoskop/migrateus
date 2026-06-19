import { Injectable } from '@nestjs/common';
import {
  readItems,
  readPermissions,
  readPolicies,
  readRoles,
  readSettings,
  readUsers,
  schemaSnapshot,
  SchemaSnapshotOutput,
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
      let rows: any[];

      switch (collection as SystemCollection) {
        case 'directus_roles':
          rows = (await client.request(readRoles(query))) as any[];
          break;
        case 'directus_policies':
          rows = (await client.request(readPolicies(query))) as any[];
          break;
        case 'directus_permissions':
          rows = (await client.request(readPermissions(query))) as any[];
          break;
        case 'directus_users':
          rows = (await client.request(readUsers(query))) as any[];
          break;
        case 'directus_access':
          rows = (await client.request(readItems('directus_access' as never, query))) as any[];
          break;
        default:
          rows = (await client.request(readItems(collection as never, query))) as any[];
          break;
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
