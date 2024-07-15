import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../../sql/sql.service.js';
import { DockerContainerService } from '../../container/docker-container/docker-container.service.js';
import { DockerService } from '../../docker/docker.service.js';
import { RestorePerformer } from '../restore-performer.js';
import { EnvironmentService } from '../../environment/environment.service.js';
import { ProgressService } from '../../progress/progress.service.js';

@Injectable()
export class DockerRestoreService extends RestorePerformer {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    private readonly dockerContainerService: DockerContainerService,
    private readonly dockerService: DockerService,
    environmentService: EnvironmentService,
    progressService: ProgressService,
  ) {
    super(
      logger,
      directusAssetService,
      sqlService,
      dockerContainerService,
      environmentService,
      progressService,
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
