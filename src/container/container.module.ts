import { Module } from '@nestjs/common';
import { DockerContainerService } from './docker-container/docker-container.service.js';
import { K8sContainerService } from './k8s-container/k8s-container.service.js';
import { AcaContainerService } from './aca-container/aca-container.service.js';
import { DockerModule } from '../docker/docker.module.js';
import { K8sModule } from '../k8s/k8s.module.js';
import { AcaModule } from '../aca/aca.module.js';
import { DEFAULT_CONTAINER_IMAGE } from './container.constants.js';

@Module({
  providers: [
    DockerContainerService,
    K8sContainerService,
    AcaContainerService,
    {
      provide: 'ContainerServices',
      useFactory: (docker, k8s, aca) => [docker, k8s, aca],
      inject: [DockerContainerService, K8sContainerService, AcaContainerService],
    },
  ],
  exports: [DockerContainerService, K8sContainerService, AcaContainerService, 'ContainerServices'],
  imports: [DockerModule, K8sModule, AcaModule],
})
export class ContainerModule {
  public static DEFAULT_IMAGE = DEFAULT_CONTAINER_IMAGE;
}
