import { Inject, Injectable } from '@nestjs/common';
import { join } from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import tmp from 'tmp';
import {
  schemaApply,
  schemaDiff,
  SchemaDiffOutput,
  SchemaSnapshotOutput,
} from '@directus/sdk';
import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { DockerService } from '../docker/docker.service.js';
import { DockerContainerService } from '../container/docker-container/docker-container.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { K8sContainerService } from '../container/k8s-container/k8s-container.service.js';
import { PortForwardService } from '../k8s/port-forward/port-forward.service.js';
import { AcaService } from '../aca/aca.service.js';
import { AcaContainerService } from '../container/aca-container/aca-container.service.js';
import { ContainerService } from '../container/container.service.js';
import { SqlService } from '../sql/sql.service.js';
import {
  DirectusLogicalService,
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
import { fileExists } from '../util/file-exists.js';
import { exec } from '../util/exec.js';

/** Resolves the platform-specific Directus HTTP port and container handle. */
interface PlatformTarget {
  port: number;
  containerService: ContainerService;
}

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
    private readonly dockerService: DockerService,
    private readonly dockerContainerService: DockerContainerService,
    private readonly k8sService: K8sService,
    private readonly k8sContainerService: K8sContainerService,
    private readonly portForwardService: PortForwardService,
    private readonly acaService: AcaService,
    private readonly acaContainerService: AcaContainerService,
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
    const backupDir = this.createTemporaryDirectory();

    try {
      this.progressService.advance('📦 Extract backup archive');
      await this.extractBackupArchive(backupDir, backupFile);

      const snapshot = JSON.parse(
        await fs.promises.readFile(join(backupDir, 'snapshot.json'), 'utf8'),
      );

      const limitationsMsg =
        'Logical restore imports users/roles/permissions with their IDs but does NOT migrate user passwords (the Directus API masks them) — affected users must reset their password or use SSO. The target should be a freshly-bootstrapped Directus; existing system rows are not pre-deleted, so a non-empty target may hit conflicts.';
      this.progressService.warn(limitationsMsg);
      this.logger.warn(limitationsMsg);

      this.progressService.advance('🚀 Set-up platform');
      const { port, containerService } = await this.setupPlatform(backupDir);

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

      this.progressService.advance('🔄 Restarting Directus');
      await this.restartDirectus();
      this.progressService.succeed('Logical restore complete');
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🛁 Clean-up');
      await this.sqlService.cleanUpDirectusUser();
      await this.cleanUpPlatform();
      await this.deleteTemporaryDirectory(backupDir);
      this.progressService.finish();
    }
  }

  /** Non-interactive schema apply: snapshot → diff → apply (skips the no-change 204). */
  private async applySchema(
    client: { request: (cmd: unknown) => Promise<unknown> },
    snapshot: SchemaSnapshotOutput,
  ): Promise<void> {
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
      collections?: { collection: string }[];
      relations?: { collection: string; field: string; related_collection: string }[];
    },
    backupDir: string,
  ): Promise<void> {
    const userCollections = (snapshot.collections ?? [])
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
    for (const collection of order) {
      const file = join(dataDir, `${collection}.json`);
      if (!(await fileExists(file))) {
        this.logger.debug(`No data file for ${chalk.bold(collection)} — skipping`);
        continue;
      }
      const rows = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      await this.directusLogicalService.importCollection(
        client,
        collection,
        rows,
        deferredFields[collection] ?? [],
      );
    }
  }

  private async setupPlatform(backupDir: string): Promise<PlatformTarget> {
    const platform = this.environmentService.environment.platform;

    if (platform.startsWith('docker')) {
      await this.dockerService.setup();
      // Remote docker (DOCKER_HOST=ssh://…) needs an SSH tunnel so the Directus
      // HTTP API is reachable on localhost; local docker returns 8055.
      const port = await this.dockerService.forwardDirectus();
      return { port, containerService: this.dockerContainerService };
    }

    if (platform === 'aca') {
      await this.acaService.setup();
      return { port: 8055, containerService: this.acaContainerService };
    }

    await this.k8sService.setup();
    const port = await this.portForwardService.forward();
    return { port, containerService: this.k8sContainerService };
  }

  private async restartDirectus(): Promise<void> {
    const platform = this.environmentService.environment.platform;

    if (platform.startsWith('docker')) {
      await this.dockerService.restartDirectus();
    } else if (platform === 'aca') {
      await this.acaService.restartDirectus();
    } else {
      await this.k8sService.restartDirectus();
    }
  }

  private async cleanUpPlatform(): Promise<void> {
    const platform = this.environmentService.environment.platform;

    if (platform.startsWith('docker')) {
      this.dockerService.stopForwardDirectus();
    } else if (platform === 'k8s') {
      this.portForwardService.stop();
      await this.k8sService.cleanUp();
    }
  }

  private createTemporaryDirectory() {
    const tempDir = tmp.dirSync({
      mode: 0o700,
      prefix: 'migrateus-',
      unsafeCleanup: true,
    }).name;
    this.logger.debug(`Created temporary directory: ${chalk.bold(tempDir)}`);
    return tempDir;
  }

  private async extractBackupArchive(backupDir: string, backupFile: string) {
    const output = await exec(`tar -xf ${backupFile} -C ${backupDir}`, {
      silent: true,
    });

    if (output.code !== 0) {
      throw new Error(
        `Failed to extract backup archive ${chalk.bold(backupFile)}: ${chalk.red(output.stderr)}`,
      );
    }
  }

  private async deleteTemporaryDirectory(backupDir: string) {
    this.logger.debug(`Removing temporary directory ${chalk.bold(backupDir)}`);
    await exec(`rm -rf ${backupDir}`, { silent: true });
  }
}
