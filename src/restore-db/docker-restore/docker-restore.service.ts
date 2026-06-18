import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import fs from 'node:fs';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../../sql/sql.service.js';
import { DockerContainerService } from '../../container/docker-container/docker-container.service.js';
import { DockerService } from '../../docker/docker.service.js';
import { RestorePerformer } from '../restore-performer.js';
import { EnvironmentService } from '../../environment/environment.service.js';
import { ProgressService } from '../../progress/progress.service.js';
import { DirectusSettingService } from '../../directus/directus-setting/directus-setting.service.js';
import { DirectusVersionService } from '../../directus/directus-version/directus-version.service.js';
import { ConfigService } from '../../config/config.service.js';

@Injectable()
export class DockerRestoreService extends RestorePerformer {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    directusSettingService: DirectusSettingService,
    private readonly dockerContainerService: DockerContainerService,
    private readonly dockerService: DockerService,
    environmentService: EnvironmentService,
    progressService: ProgressService,
    directusVersionService: DirectusVersionService,
    configService: ConfigService,
  ) {
    super(
      logger,
      directusAssetService,
      directusSettingService,
      sqlService,
      dockerContainerService,
      environmentService,
      progressService,
      directusVersionService,
      configService,
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

  protected async restartDirectus(): Promise<void> {
    await this.dockerService.restartDirectus();
  }

  protected async copyDatabaseIn(backupDir: string): Promise<void> {
    const file = this.sqlService.databaseFilename;
    await this.dockerContainerService.copyToDirectus(`${backupDir}/database.sqlite`, file);

    // Best-effort: copy WAL and SHM sidecars back if they exist locally
    for (const suffix of ['-wal', '-shm']) {
      const localSidecar = `${backupDir}/database.sqlite${suffix}`;
      if (fs.existsSync(localSidecar)) {
        await this.dockerContainerService.copyToDirectus(localSidecar, `${file}${suffix}`);
      }
    }

    if (
      fs.existsSync(`${backupDir}/uploads`) &&
      this.dockerService.directusStorageIsLocal &&
      this.dockerService.directusStorageRoot
    ) {
      await this.dockerContainerService.copyToDirectus(
        `${backupDir}/uploads`,
        this.dockerService.directusStorageRoot,
      );
    }
  }
}
