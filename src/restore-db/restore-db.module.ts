import { Module } from '@nestjs/common';
import { RestoreDbCommand } from './restore-db.command.js';
import { ConfigModule } from '../config/config.module.js';
import { RestoreDbQuestions } from './restore-db.questions.js';
import { DockerRestoreService } from './docker-restore/docker-restore.service.js';
import { K8sRestoreService } from './k8s-restore/k8s-restore.service.js';
import { ContainerModule } from '../container/container.module.js';
import { DirectusModule } from '../directus/directus.module.js';
import { DockerModule } from '../docker/docker.module.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { K8sModule } from '../k8s/k8s.module.js';
import { SqlModule } from '../sql/sql.module.js';
import { DependenciesModule } from '../dependencies/dependencies.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { UpdateModule } from '../update/update.module.js';

@Module({
  providers: [
    RestoreDbCommand,
    RestoreDbQuestions,
    DockerRestoreService,
    K8sRestoreService,
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
    UpdateModule,
  ],
})
export class RestoreDbModule {}
