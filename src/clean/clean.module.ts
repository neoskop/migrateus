import { Module } from '@nestjs/common';
import { CleanService } from './clean.service.js';
import { CleanCommand } from './clean.command.js';
import { ConfigModule } from '../config/config.module.js';
import { CleanQuestions } from './clean.questions.js';
import { ContainerModule } from '../container/container.module.js';
import { SqlModule } from '../sql/sql.module.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { K8sModule } from '../k8s/k8s.module.js';
import { DockerModule } from '../docker/docker.module.js';
import { DependenciesModule } from '../dependencies/dependencies.module.js';

@Module({
  providers: [CleanService, CleanCommand, CleanQuestions],
  imports: [
    ConfigModule,
    SqlModule,
    ContainerModule,
    EnvironmentModule,
    K8sModule,
    DockerModule,
    DependenciesModule,
  ],
})
export class CleanModule {}
