import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { DockerBackupService } from './docker-backup/docker-backup.service.js';
import { K8sBackupService } from './k8s-backup/k8s-backup.service.js';
import { AcaBackupService } from './aca-backup/aca-backup.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { LogicalBackupPerformer } from './logical-backup.performer.js';

@Injectable()
export class BackupDbService {
  public constructor(
    private readonly config: ConfigService,
    private readonly dockerBackupService: DockerBackupService,
    private readonly k8sBackupService: K8sBackupService,
    private readonly acaBackupService: AcaBackupService,
    private readonly environmentService: EnvironmentService,
    private readonly logicalBackupPerformer: LogicalBackupPerformer,
  ) {}

  public async backup(sourceEnvironment: string, backupFile: string) {
    const environment = this.config.getEnvironment(sourceEnvironment);
    this.environmentService.environment = environment;

    if (this.config.logical) {
      await this.logicalBackupPerformer.backup(sourceEnvironment, backupFile);
      return;
    }

    if (environment.platform.startsWith('docker')) {
      await this.dockerBackupService.backup(backupFile);
    } else if (environment.platform === 'aca') {
      await this.acaBackupService.backup(backupFile);
    } else {
      await this.k8sBackupService.backup(backupFile);
    }
  }
}
