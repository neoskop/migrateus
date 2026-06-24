import { Inject, Injectable } from '@nestjs/common';
import { join } from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import {
  createWorkDir,
  removeWorkDir,
  extractArchive,
} from '../util/backup-archive.js';
import {
  schemaApply,
  schemaDiff,
  SchemaDiffOutput,
  SchemaSnapshotOutput,
} from '@directus/sdk';
import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { PlatformResolver } from '../platform/platform-resolver.service.js';
import { SqlService } from '../sql/sql.service.js';
import {
  DirectusLogicalService,
  LicenseSkippedRow,
  SYSTEM_COLLECTIONS,
} from '../directus/directus-logical/directus-logical.service.js';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { DirectusVersionService } from '../directus/directus-version/directus-version.service.js';
import { DirectusService } from '../directus/directus.service.js';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';
import { ConfigService } from '../config/config.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { planImportOrder, Relation } from '../transfer/import-order.js';
import { alignUuidForeignKeyTypes } from '../transfer/align-relation-field-types.js';
import { fileExists } from '../util/file-exists.js';

/**
 * Foreign keys between system collections. The schema snapshot omits relations
 * for `directus_*` collections, so the importer would otherwise insert them in
 * an arbitrary order and break their FKs. These are fed to the planner together
 * with the snapshot's user relations.
 */
const SYSTEM_RELATIONS: Relation[] = [
  // directus_roles.parent → directus_roles (self-reference, deferred)
  {
    collection: 'directus_roles',
    field: 'parent',
    relatedCollection: 'directus_roles',
  },
  // directus_users.role → directus_roles
  {
    collection: 'directus_users',
    field: 'role',
    relatedCollection: 'directus_roles',
  },
  // directus_permissions.policy → directus_policies
  {
    collection: 'directus_permissions',
    field: 'policy',
    relatedCollection: 'directus_policies',
  },
  // directus_access.role → directus_roles
  {
    collection: 'directus_access',
    field: 'role',
    relatedCollection: 'directus_roles',
  },
  // directus_access.user → directus_users
  {
    collection: 'directus_access',
    field: 'user',
    relatedCollection: 'directus_users',
  },
  // directus_access.policy → directus_policies
  {
    collection: 'directus_access',
    field: 'policy',
    relatedCollection: 'directus_policies',
  },
];

@Injectable()
export class LogicalRestorePerformer {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) private readonly logger: LoggerService,
    private readonly platformResolver: PlatformResolver,
    private readonly sqlService: SqlService,
    private readonly directusLogicalService: DirectusLogicalService,
    private readonly directusAssetService: DirectusAssetService,
    private readonly directusVersionService: DirectusVersionService,
    private readonly directusService: DirectusService,
    private readonly directusUserService: DirectusUserService,
    private readonly config: ConfigService,
    private readonly progressService: ProgressService,
    private readonly environmentService: EnvironmentService,
  ) {}

  public async restore(
    backupFile: string,
    _environmentName: string,
  ): Promise<void> {
    const backupDir = createWorkDir(0o700);
    const platform = this.platformResolver.resolve(
      this.environmentService.environment.platform,
    );

    try {
      this.progressService.advance('📦 Extract backup archive');
      await extractArchive(backupFile, backupDir);

      const snapshot = JSON.parse(
        await fs.promises.readFile(join(backupDir, 'snapshot.json'), 'utf8'),
      );

      const limitationsMsg =
        'Logical restore imports users/roles/permissions with their IDs but does NOT migrate user passwords (the Directus API masks them) — affected users must reset their password or use SSO. The target should be a freshly-bootstrapped Directus; existing system rows are not pre-deleted, so a non-empty target may hit conflicts.';
      this.progressService.warn(limitationsMsg);
      this.logger.warn(limitationsMsg);

      this.progressService.advance('🚀 Set-up platform');
      const { port, containerService } = await platform.connect();

      this.progressService.advance('👤 Set-up Directus user');
      await this.sqlService.setupDirectusUser(containerService, port);
      // The SDK client's `request` is generic over the command type; the
      // logical service consumes a structural `{ request(cmd: unknown) }`. They
      // are not bidirectionally assignable, so adapt at the call site.
      const client = this.directusService.getClient(
        port,
        this.directusUserService.token,
      ) as unknown as { request: (cmd: unknown) => Promise<unknown> };

      if (this.config.force) {
        this.logger.debug('Skipping Directus version check (--force)');
      } else {
        this.progressService.advance('🔎 Compare Directus versions');
        await this.directusVersionService.getVersion(port);
      }

      this.progressService.advance('📐 Apply schema');
      await this.applySchema(client, snapshot);

      this.progressService.advance('📥 Import items');
      await this.importItems(client, snapshot, backupDir);

      if (this.config.noAssets) {
        this.logger.debug('Skipping restore of assets');
      } else {
        this.progressService.advance('🖼️ Restoring assets');
        const failedUploads = await this.directusAssetService.restoreAssets(
          port,
          backupDir,
          this.progressService.updateText.bind(this.progressService),
        );
        if (failedUploads > 0) {
          this.progressService.warn(
            `Failed to upload ${chalk.bold(failedUploads)} assets.`,
          );
        }
      }

      this.progressService.succeed('Logical restore complete');
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🛁 Clean-up');
      // Delete the temp admin BEFORE restarting — the restart drops the HTTP
      // API mid-request, which would otherwise fail the cleanup ('fetch failed').
      // A cleanup/restart failure must NOT skip teardown: teardown closes the
      // ACA ingress proxy, and an unclosed server keeps the process alive
      // forever. So each step is best-effort and teardown always runs. A
      // leftover temp admin is swept by the `clean` command.
      try {
        await this.sqlService.cleanUpDirectusUser();
      } catch (cleanupError: any) {
        this.logger.warn(
          `Failed to remove the temporary Directus admin: ${cleanupError?.message ?? cleanupError}`,
        );
      }
      this.progressService.advance('🔄 Restarting Directus');
      try {
        await platform.restartDirectus();
      } catch (restartError: any) {
        this.logger.warn(
          `Failed to restart Directus: ${restartError?.message ?? restartError}`,
        );
      }
      await platform.teardown();
      await removeWorkDir(backupDir);
      this.progressService.finish();
    }
  }

  /** Non-interactive schema apply: snapshot → diff → apply (skips the no-change 204). */
  private async applySchema(
    client: { request: (cmd: unknown) => Promise<unknown> },
    snapshot: SchemaSnapshotOutput,
  ): Promise<void> {
    // Cross-DBMS fidelity: a SQLite snapshot records uuid FK columns as
    // varchar; coerce them back to uuid so foreign keys can be created on a
    // database with a native uuid type (e.g. Postgres).
    alignUuidForeignKeyTypes(snapshot as never);

    const diff = (await client.request(schemaDiff(snapshot, true))) as
      | (SchemaDiffOutput & { status?: number })
      | null;

    if (!diff || diff.status === 204) {
      this.logger.debug('Schema already matches snapshot — nothing to apply');
      return;
    }

    await client.request(schemaApply(diff));
  }

  private async importItems(
    client: { request: (cmd: unknown) => Promise<unknown> },
    snapshot: {
      collections?: {
        collection: string;
        schema?: unknown;
        meta?: { singleton?: boolean } | null;
      }[];
      fields?: {
        collection: string;
        field: string;
        type?: string;
        schema?: unknown;
      }[];
      relations?: { collection: string; field: string; related_collection: string }[];
    },
    backupDir: string,
  ): Promise<void> {
    // Singleton collections have no /items POST route — import via updateSingleton.
    const singletons = new Set(
      (snapshot.collections ?? [])
        .filter((c) => c.meta?.singleton)
        .map((c) => c.collection),
    );
    // Alias fields (O2M/M2A/presentation) have a null schema in the snapshot
    // and are stripped before import. json fields need string values encoded so
    // Postgres accepts them.
    const aliasByCollection = new Map<string, string[]>();
    const jsonByCollection = new Map<string, string[]>();
    for (const field of snapshot.fields ?? []) {
      if (field.schema == null) {
        const list = aliasByCollection.get(field.collection) ?? [];
        list.push(field.field);
        aliasByCollection.set(field.collection, list);
      }
      if (field.type === 'json') {
        const list = jsonByCollection.get(field.collection) ?? [];
        list.push(field.field);
        jsonByCollection.set(field.collection, list);
      }
    }

    const userCollections = (snapshot.collections ?? [])
      // Folder/presentation collections have no table (schema null) — they hold
      // no items, so skip them (their data file won't exist anyway).
      .filter((c) => c.schema != null)
      .map((c) => c.collection)
      .filter((c) => c && !c.startsWith('directus_'));
    const collections = [...SYSTEM_COLLECTIONS, ...userCollections];

    // Directus snapshots use `related_collection` (snake_case); the planner
    // consumes `relatedCollection`. Map and drop relations without a target
    // (e.g. M2A relations have a null related_collection).
    const snapshotRelations: Relation[] = (snapshot.relations ?? [])
      .filter((r) => r.related_collection)
      .map((r) => ({
        collection: r.collection,
        field: r.field,
        relatedCollection: r.related_collection,
      }));

    const relations: Relation[] = [...SYSTEM_RELATIONS, ...snapshotRelations];

    const { order, deferredFields } = planImportOrder(collections, relations);

    const dataDir = join(backupDir, 'data');
    const licenseSkips: LicenseSkippedRow[] = [];
    for (const collection of order) {
      const file = join(dataDir, `${collection}.json`);
      if (!(await fileExists(file))) {
        this.logger.debug(`No data file for ${chalk.bold(collection)} — skipping`);
        continue;
      }
      const rows = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      const skipped = await this.directusLogicalService.importCollection(
        client,
        collection,
        rows,
        deferredFields[collection] ?? [],
        aliasByCollection.get(collection) ?? [],
        singletons.has(collection),
        jsonByCollection.get(collection) ?? [],
      );
      licenseSkips.push(...skipped);
    }

    if (licenseSkips.length > 0) {
      const byCollection = new Map<string, string[]>();
      for (const skip of licenseSkips) {
        const list = byCollection.get(skip.collection) ?? [];
        list.push(skip.detail);
        byCollection.set(skip.collection, list);
      }
      const detail = [...byCollection.entries()]
        .map(([collection, rows]) => `${collection} → ${rows.join('; ')}`)
        .join(' | ');
      const msg =
        `Skipped ${licenseSkips.length} row(s) the target Directus license ` +
        `forbids (e.g. custom permission rules, or admin/app "seats" beyond the ` +
        `target's cap): ${detail}. The corresponding access/permission rules were ` +
        `NOT applied; raise the target's Directus license and re-run for a ` +
        `faithful restore.`;
      this.progressService.warn(msg);
      this.logger.warn(msg);
    }
  }

}
