import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import shell from 'shelljs';
import chalk from 'chalk';
import { SqlService } from '../../sql/sql.service.js';
import { K8sContainerService } from '../../container/k8s-container/k8s-container.service.js';
import { K8sService } from '../../k8s/k8s.service.js';
import { RestorePerformer } from '../restore-performer.js';
import { EnvironmentService } from '../../environment/environment.service.js';
import { PortForwardService } from '../../k8s/port-forward/port-forward.service.js';

@Injectable()
export class K8sRestoreService extends RestorePerformer {
  private backupDir: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    private readonly kubernetesContainerService: K8sContainerService,
    private readonly k8sService: K8sService,
    environmentService: EnvironmentService,
    private readonly portForwardService: PortForwardService,
  ) {
    super(
      logger,
      directusAssetService,
      sqlService,
      kubernetesContainerService,
      environmentService,
    );
  }

  protected async setup(backupDir: string): Promise<void> {
    this.backupDir = backupDir;
    this.k8sService.setup();
  }

  protected async beforeMysqlDumpRestore(): Promise<void> {
    const ouput = shell.exec(
      `kubectl cp ${this.backupDir}/backup.sql ${this.kubernetesContainerService.migrateusPodName}:/tmp/backup.sql`,
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
