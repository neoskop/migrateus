import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { BackupPerformer } from '../backup-performer.js';
import chalk from 'chalk';
import { SqlService } from '../../sql/sql.service.js';
import { K8sContainerService } from '../../container/k8s-container/k8s-container.service.js';
import { K8sService } from '../../k8s/k8s.service.js';
import { ConfigService } from '../../config/config.service.js';
import { PortForwardService } from '../../k8s/port-forward/port-forward.service.js';
import { exec } from '../../util/exec.js';
import { ProgressService } from '../../progress/progress.service.js';

@Injectable()
export class K8sBackupService extends BackupPerformer {
  private backupDir: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    private readonly kubernetesContainerService: K8sContainerService,
    private readonly k8sService: K8sService,
    config: ConfigService,
    private readonly portForwardService: PortForwardService,
    progressService: ProgressService,
  ) {
    super(
      logger,
      directusAssetService,
      sqlService,
      kubernetesContainerService,
      config,
      progressService,
    );
  }

  protected async setup(backupDir: string): Promise<void> {
    this.backupDir = backupDir;
    await this.k8sService.setup();
  }

  protected async afterMysqlDump(): Promise<void> {
    const ouput = await exec(
      `kubectl cp ${this.kubernetesContainerService.migrateusPodName}:/tmp/backup.sql ${this.backupDir}/backup.sql`,
      { silent: true },
    );

    if (ouput.code !== 0) {
      throw new Error(
        `Failed to copy ${this.kubernetesContainerService.migrateusPodName}:${chalk.bold('/tmp/backup.sql')} to ${chalk.bold(this.backupDir)}/backup.sql: ${ouput.stderr}`,
      );
    }
  }

  protected async getDirectusPort(): Promise<number> {
    return this.portForwardService.forward();
  }

  protected async cleanUp(): Promise<void> {
    return this.portForwardService.stop();
  }
}
