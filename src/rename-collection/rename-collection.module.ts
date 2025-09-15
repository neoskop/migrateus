import { Module } from '@nestjs/common';
import { RenameCollectionCommand } from './rename-collection.command.js';
import { ConfigModule } from '../config/config.module.js';
import { ContainerModule } from '../container/container.module.js';
import { DependenciesModule } from '../dependencies/dependencies.module.js';
import { DockerModule } from '../docker/docker.module.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { K8sModule } from '../k8s/k8s.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { SqlModule } from '../sql/sql.module.js';
import { UpdateModule } from '../update/update.module.js';
import { RenameCollectionQuestions } from './rename-collection.questions.js';
import { RenameCollectionService } from './rename-collection.service.js';

@Module({
  providers: [RenameCollectionService, RenameCollectionCommand, RenameCollectionQuestions],
  imports: [
    ConfigModule,
    SqlModule,
    ContainerModule,
    EnvironmentModule,
    K8sModule,
    DockerModule,
    DependenciesModule,
    ProgressModule,
    UpdateModule,
  ],
})
export class RenameCollectionModule { }
