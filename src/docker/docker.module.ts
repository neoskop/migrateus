import { Module } from '@nestjs/common';
import { DockerService } from './docker.service.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { SqlModule } from '../sql/sql.module.js';

@Module({
  providers: [DockerService],
  exports: [DockerService],
  imports: [EnvironmentModule, SqlModule],
})
export class DockerModule {}
