import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { BackupPerformer } from '../backup-performer.js';
import chalk from 'chalk';
import { SqlService } from '../../sql/sql.service.js';
import { K8sContainerService } from '../../container/k8s-container/k8s-container.service.js';
import { K8sService } from '../../k8s/k8s.service.js';
import { ConfigService } from '../../config/config.service.js';
import { PortForwardService } from '../../k8s/port-forward/port-forward.service.js';
import { ProgressService } from '../../progress/progress.service.js';
import { DirectusVersionService } from '../../directus/directus-version/directus-version.service.js';

@Injectable()
export class K8sBackupService extends BackupPerformer {
  private backupDir: string;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    private readonly kubernetesContainerService: K8sContainerService,
    private readonly k8sService: K8sService,
    config: ConfigService,
    private readonly portForwardService: PortForwardService,
    progressService: ProgressService,
    directusVersionService: DirectusVersionService,
  ) {
    super(
      logger,
      directusAssetService,
      sqlService,
      kubernetesContainerService,
      config,
      progressService,
      directusVersionService,
    );
  }

  protected async setup(backupDir: string): Promise<void> {
    this.backupDir = backupDir;
    await this.k8sService.setup();
  }

  protected async afterMysqlDump(): Promise<void> {
    await this.kubernetesContainerService.exfilFile(
      '/tmp/backup.sql',
      `${this.backupDir}/backup.sql`,
    );
  }

  protected getDirectusPort(): Promise<number> {
    return this.portForwardService.forward();
  }

  protected async cleanUp(): Promise<void> {
    this.portForwardService.stop();
    await this.k8sService.cleanUp();
  }

  protected copyDatabaseOut(_backupDir: string): Promise<void> {
    return Promise.reject(
      new Error(
        'SQLite is only supported on docker/docker-compose platforms — use a server engine (PostgreSQL) on k8s/ACA',
      ),
    );
  }
}
