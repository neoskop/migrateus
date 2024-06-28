import { Module } from '@nestjs/common';
import { K8sService } from './k8s.service.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { SqlModule } from '../sql/sql.module.js';

@Module({
  providers: [K8sService],
  exports: [K8sService],
  imports: [EnvironmentModule, SqlModule],
})
export class K8sModule {}
