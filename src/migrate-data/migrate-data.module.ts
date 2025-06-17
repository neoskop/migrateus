import { Module } from '@nestjs/common';
import { MigrateDataService } from './migrate-data.service.js';
import { MigrateDataCommand } from './migrate-data.command.js';
import { MigrateDataQuestions } from './migrate-data.questions.js';
import { ConfigModule } from '../config/config.module.js';
import { ContainerModule } from '../container/container.module.js';
import { DependenciesModule } from '../dependencies/dependencies.module.js';
import { DirectusModule } from '../directus/directus.module.js';
import { DockerModule } from '../docker/docker.module.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { K8sModule } from '../k8s/k8s.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { SqlModule } from '../sql/sql.module.js';
import { UpdateModule } from '../update/update.module.js';
import { MigrateDataPromptService } from './migrate-data-prompt/migrate-data-prompt.service.js';

@Module({
  providers: [
    MigrateDataService,
    MigrateDataCommand,
    MigrateDataQuestions,
    MigrateDataPromptService,
  ],
  imports: [
    ConfigModule,
    K8sModule,
    DockerModule,
    DirectusModule,
    SqlModule,
    ContainerModule,
    EnvironmentModule,
    DependenciesModule,
    ProgressModule,
    UpdateModule,
  ],
})
export class MigrateDataModule {}
