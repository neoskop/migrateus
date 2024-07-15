import { Module } from '@nestjs/common';
import { BackupDbCommand } from './backup-db.command.js';
import { ConfigModule } from '../config/config.module.js';
import { BackupDbQuestions } from './backup-db.questions.js';
import { BackupDbService } from './backup-db.service.js';
import { DockerBackupService } from './docker-backup/docker-backup.service.js';
import { K8sBackupService } from './k8s-backup/k8s-backup.service.js';
import { DirectusModule } from '../directus/directus.module.js';
import { SqlModule } from '../sql/sql.module.js';
import { ContainerModule } from '../container/container.module.js';
import { DockerModule } from '../docker/docker.module.js';
import { K8sModule } from '../k8s/k8s.module.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { DependenciesModule } from '../dependencies/dependencies.module.js';
import { ProgressModule } from '../progress/progress.module.js';

@Module({
  providers: [
    BackupDbCommand,
    BackupDbQuestions,
    BackupDbService,
    DockerBackupService,
    K8sBackupService,
  ],
  imports: [
    ConfigModule,
    DirectusModule,
    SqlModule,
    ContainerModule,
    DockerModule,
    K8sModule,
    EnvironmentModule,
    DependenciesModule,
    ProgressModule,
  ],
})
export class BackupDbModule {}
