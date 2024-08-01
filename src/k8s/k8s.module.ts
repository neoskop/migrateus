import { Module } from '@nestjs/common';
import { K8sService } from './k8s.service.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { SqlModule } from '../sql/sql.module.js';
import { PortForwardService } from './port-forward/port-forward.service.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  providers: [K8sService, PortForwardService],
  exports: [K8sService, PortForwardService],
  imports: [EnvironmentModule, SqlModule, ConfigModule],
})
export class K8sModule {}
