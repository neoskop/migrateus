import { Module } from '@nestjs/common';
import { BackupDbCommand } from './backup-db.command.js';
import { ConfigModule } from '../config/config.module.js';
import { BackupDbQuestions } from './backup-db.questions.js';
import { BackupDbService } from './backup-db.service.js';
import { DockerBackupService } from './docker-backup/docker-backup.service.js';
import { K8sBackupService } from './k8s-backup/k8s-backup.service.js';

@Module({
  providers: [
    BackupDbCommand,
    BackupDbQuestions,
    BackupDbService,
    DockerBackupService,
    K8sBackupService,
  ],
  imports: [ConfigModule],
})
export class BackupDbModule {}
