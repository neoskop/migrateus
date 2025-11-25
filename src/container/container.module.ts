import { Module } from '@nestjs/common';
import { DockerContainerService } from './docker-container/docker-container.service.js';
import { K8sContainerService } from './k8s-container/k8s-container.service.js';
import { DockerModule } from '../docker/docker.module.js';
import { K8sModule } from '../k8s/k8s.module.js';

@Module({
  providers: [
    DockerContainerService,
    K8sContainerService,
    {
      provide: 'ContainerServices',
      useFactory: (docker, k8s) => [docker, k8s],
      inject: [DockerContainerService, K8sContainerService],
    },
  ],
  exports: [DockerContainerService, K8sContainerService, 'ContainerServices'],
  imports: [DockerModule, K8sModule],
})
export class ContainerModule {
  public static DEFAULT_IMAGE = 'mysql:9.5.0-oraclelinux9';
}
