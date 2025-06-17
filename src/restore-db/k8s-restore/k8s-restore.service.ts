import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../../sql/sql.service.js';
import { K8sContainerService } from '../../container/k8s-container/k8s-container.service.js';
import { K8sService } from '../../k8s/k8s.service.js';
import { RestorePerformer } from '../restore-performer.js';
import { EnvironmentService } from '../../environment/environment.service.js';
import { PortForwardService } from '../../k8s/port-forward/port-forward.service.js';
import { ProgressService } from '../../progress/progress.service.js';
import { DirectusSettingService } from '../../directus/directus-setting/directus-setting.service.js';
import { DirectusVersionService } from '../../directus/directus-version/directus-version.service.js';
import { ConfigService } from '../../config/config.service.js';

@Injectable()
export class K8sRestoreService extends RestorePerformer {
  private backupDir: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    directusSettingService: DirectusSettingService,
    private readonly kubernetesContainerService: K8sContainerService,
    private readonly k8sService: K8sService,
    environmentService: EnvironmentService,
    private readonly portForwardService: PortForwardService,
    progressService: ProgressService,
    directusVersionService: DirectusVersionService,
    configService: ConfigService,
  ) {
    super(
      logger,
      directusAssetService,
      directusSettingService,
      sqlService,
      kubernetesContainerService,
      environmentService,
      progressService,
      directusVersionService,
      configService,
    );
  }

  protected async setup(backupDir: string): Promise<void> {
    this.backupDir = backupDir;
    await this.k8sService.setup();
  }

  protected async beforeMysqlDumpRestore(): Promise<void> {
    await this.kubernetesContainerService.infilFile(
      `${this.backupDir}/backup.sql`,
      '/tmp/backup.sql',
    );
  }

  protected async getDirectusPort(): Promise<number> {
    return this.portForwardService.forward();
  }

  protected async cleanUp(): Promise<void> {
    this.portForwardService.stop();
    await this.k8sService.cleanUp();
  }

  protected async restartDirectus(): Promise<void> {
    await this.k8sService.restartDirectus();
  }
}
