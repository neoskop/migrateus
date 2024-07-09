import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { BackupPerformer } from '../backup-performer.js';
import { SqlService } from '../../sql/sql.service.js';
import { DockerContainerService } from '../../container/docker-container/docker-container.service.js';
import { DockerService } from '../../docker/docker.service.js';
import { ConfigService } from '../../config/config.service.js';

@Injectable()
export class DockerBackupService extends BackupPerformer {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    private readonly dockerContainerService: DockerContainerService,
    private readonly dockerService: DockerService,
    config: ConfigService,
  ) {
    super(
      logger,
      directusAssetService,
      sqlService,
      dockerContainerService,
      config,
    );
  }

  protected async setup(backupDir: string) {
    await this.dockerService.setup();
    this.dockerContainerService.mount = backupDir;
  }

  protected async getDirectusPort(): Promise<number> {
    return 8055;
  }
}
