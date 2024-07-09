import { Module } from '@nestjs/common';
import { SchemaDiffCommand } from './schema-diff.command.js';
import { ConfigModule } from '../config/config.module.js';
import { SchemaDiffQuestions } from './schema-diff.questions.js';
import { SchemaDiffService } from './schema-diff.service.js';
import { K8sModule } from '../k8s/k8s.module.js';
import { DockerModule } from '../docker/docker.module.js';
import { DirectusModule } from '../directus/directus.module.js';
import { SqlModule } from '../sql/sql.module.js';
import { ContainerModule } from '../container/container.module.js';
import { EnvironmentModule } from '../environment/environment.module.js';

@Module({
  providers: [SchemaDiffCommand, SchemaDiffQuestions, SchemaDiffService],
  imports: [
    ConfigModule,
    K8sModule,
    DockerModule,
    DirectusModule,
    SqlModule,
    ContainerModule,
    EnvironmentModule,
  ],
})
export class SchemaDiffModule {}
