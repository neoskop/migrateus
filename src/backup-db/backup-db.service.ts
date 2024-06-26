import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { DockerBackupService } from './docker-backup/docker-backup.service.js';
import { K8sBackupService } from './k8s-backup/k8s-backup.service.js';

@Injectable()
export class BackupDbService {
  public constructor(
    private readonly config: ConfigService,
    private readonly dockerBackupService: DockerBackupService,
    private readonly k8sBackupService: K8sBackupService,
  ) {}

  public async backup(sourceEnvironment: string, backupFile: string) {
    const environment = await this.config.getEnvironment(sourceEnvironment);

    if (environment.platform === 'docker') {
      await this.dockerBackupService.backup(environment, backupFile);
    } else {
      await this.k8sBackupService.backup(environment, backupFile);
    }
  }
}
