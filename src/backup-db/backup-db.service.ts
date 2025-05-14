import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { DockerBackupService } from './docker-backup/docker-backup.service.js';
import { K8sBackupService } from './k8s-backup/k8s-backup.service.js';
import { EnvironmentService } from '../environment/environment.service.js';

@Injectable()
export class BackupDbService {
  public constructor(
    private readonly config: ConfigService,
    private readonly dockerBackupService: DockerBackupService,
    private readonly k8sBackupService: K8sBackupService,
    private readonly environmentService: EnvironmentService,
  ) {}

  public async backup(sourceEnvironment: string, backupFile: string) {
    const environment = this.config.getEnvironment(sourceEnvironment);
    this.environmentService.environment = environment;

    if (environment.platform.startsWith('docker')) {
      await this.dockerBackupService.backup(backupFile);
    } else {
      await this.k8sBackupService.backup(backupFile);
    }
  }
}
