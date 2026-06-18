import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { BackupPerformer } from '../backup-performer.js';
import { SqlService } from '../../sql/sql.service.js';
import { DockerContainerService } from '../../container/docker-container/docker-container.service.js';
import { DockerService } from '../../docker/docker.service.js';
import { ConfigService } from '../../config/config.service.js';
import { ProgressService } from '../../progress/progress.service.js';
import { DirectusVersionService } from '../../directus/directus-version/directus-version.service.js';

@Injectable()
export class DockerBackupService extends BackupPerformer {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    private readonly dockerContainerService: DockerContainerService,
    private readonly dockerService: DockerService,
    config: ConfigService,
    progressService: ProgressService,
    directusVersionService: DirectusVersionService,
  ) {
    super(
      logger,
      directusAssetService,
      sqlService,
      dockerContainerService,
      config,
      progressService,
      directusVersionService,
    );
  }

  protected async setup(backupDir: string) {
    await this.dockerService.setup();
    if (this.sqlService.usesSidecar) {
      this.dockerContainerService.mount = backupDir;
    }
  }

  protected getDirectusPort(): Promise<number> {
    return Promise.resolve(8055);
  }

  protected async copyDatabaseOut(backupDir: string): Promise<void> {
    const file = this.sqlService.databaseFilename;
    await this.dockerContainerService.copyFromDirectus(file, `${backupDir}/database.sqlite`);

    // Best-effort: copy WAL and SHM sidecars — they may not exist
    for (const suffix of ['-wal', '-shm']) {
      try {
        await this.dockerContainerService.copyFromDirectus(`${file}${suffix}`, `${backupDir}/database.sqlite${suffix}`);
      } catch {
        this.logger.debug(`SQLite sidecar ${suffix} not found, skipping`);
      }
    }

    if (this.dockerService.directusStorageIsLocal && this.dockerService.directusStorageRoot) {
      await this.dockerContainerService.copyFromDirectus(this.dockerService.directusStorageRoot, `${backupDir}/uploads`);
    } else {
      this.logger.debug('External storage detected — assets skipped for SQLite backup');
    }
  }

  protected getDirectusVersionHint(): string | undefined {
    const image = this.dockerService.containerConfig?.Config?.Image;
    if (!image) return undefined;
    const colonIdx = image.lastIndexOf(':');
    if (colonIdx === -1) return undefined;
    return image.slice(colonIdx + 1) || undefined;
  }
}
