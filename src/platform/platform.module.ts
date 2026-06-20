import { Module } from '@nestjs/common';
import { DockerModule } from '../docker/docker.module.js';
import { K8sModule } from '../k8s/k8s.module.js';
import { AcaModule } from '../aca/aca.module.js';
import { PlatformResolver } from './platform-resolver.service.js';

@Module({
  providers: [PlatformResolver],
  exports: [PlatformResolver],
  imports: [DockerModule, K8sModule, AcaModule],
})
export class PlatformModule {}
