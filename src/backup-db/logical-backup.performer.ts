import { Inject, Injectable } from '@nestjs/common';
import { join } from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import tmp from 'tmp';
import { resolveOutputPath } from '../util/resolve-output-path.js';
import prettyBytes from 'pretty-bytes';
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
import { exec } from '../util/exec.js';

/** Resolves the platform-specific Directus HTTP port and container handle. */
interface PlatformTarget {
  port: number;
  containerService: ContainerService;
}

@Injectable()
export class LogicalBackupPerformer {
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

  public async backup(
    _environmentName: string,
    backupFile: string,
  ): Promise<void> {
    const backupDir = this.createTemporaryDirectory();

    try {
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

      this.progressService.advance('📐 Export schema');
      const snapshot = await this.directusLogicalService.exportSchema(client);
      await fs.promises.writeFile(
        join(backupDir, 'snapshot.json'),
        JSON.stringify(snapshot, null, 2),
      );

      this.progressService.advance('📤 Export items');
      const dataDir = join(backupDir, 'data');
      await fs.promises.mkdir(dataDir, { recursive: true });

      const userCollections = (snapshot.collections ?? [])
        // Folder/presentation collections have no table (schema null) and are
        // not queryable via /items — skip them; only real collections hold data.
        .filter((c) => (c as { schema?: unknown }).schema != null)
        .map((c) => c.collection as string)
        .filter((c) => c && !c.startsWith('directus_'));
      const collections = [...SYSTEM_COLLECTIONS, ...userCollections];

      for (const collection of collections) {
        const items = await this.directusLogicalService.exportCollection(
          client,
          collection,
        );
        await fs.promises.writeFile(
          join(dataDir, `${collection}.json`),
          JSON.stringify(items, null, 2),
        );
      }

      if (this.config.noAssets) {
        this.logger.debug('Skipping backup of assets');
      } else {
        this.progressService.advance('🖼️ Downloading assets');
        await this.directusAssetService.backupAssets(
          port,
          backupDir,
          this.progressService.updateText.bind(this.progressService),
        );
      }

      this.progressService.advance('🏷️ Save backup metadata');
      await this.storeMetadata(port, backupDir);

      this.progressService.advance('📦 Create backup archive');
      const size = await this.createBackupArchive(backupDir, backupFile);
      this.progressService.succeed(`Archive is ${chalk.bold(size)} in size`);
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

  private async cleanUpPlatform(): Promise<void> {
    const platform = this.environmentService.environment.platform;

    if (platform.startsWith('docker')) {
      this.dockerService.stopForwardDirectus();
    } else if (platform === 'k8s') {
      this.portForwardService.stop();
      await this.k8sService.cleanUp();
    }
  }

  private async storeMetadata(port: number, backupDir: string) {
    const version = await this.directusVersionService.getVersion(port);
    await fs.promises.writeFile(
      join(backupDir, 'meta.json'),
      JSON.stringify(
        {
          format: 'logical',
          version,
          sourceClient: this.sqlService.client,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  private createTemporaryDirectory() {
    // Owner-only (0o700): the logical staging dir holds dumped directus_users
    // (password hashes) + settings. Unlike the physical path it is written by
    // this process directly (no uid-1000 sidecar bind-mount), so it needs no
    // world access.
    const tempDir = tmp.dirSync({
      mode: 0o700,
      prefix: 'migrateus-',
      unsafeCleanup: true,
    }).name;
    this.logger.debug(`Created temporary directory: ${chalk.bold(tempDir)}`);
    return tempDir;
  }

  private async createBackupArchive(backupDir: string, backupFile: string) {
    const targetPath = resolveOutputPath(backupFile);
    const output = await exec(`tar -czf ${targetPath} *`, {
      silent: true,
      cwd: backupDir,
    });

    if (output.code !== 0) {
      throw new Error(
        `Failed to create backup archive ${chalk.bold(targetPath)}: ${chalk.red(output.stderr)}`,
      );
    }

    const { size } = await fs.promises.stat(targetPath);
    return prettyBytes(size);
  }

  private async deleteTemporaryDirectory(backupDir: string) {
    this.logger.debug(`Removing temporary directory ${chalk.bold(backupDir)}`);
    await exec(`rm -rf ${backupDir}`, { silent: true });
  }
}
