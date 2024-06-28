import { Injectable } from '@nestjs/common';
import { DockerContainerService } from '../container/docker-container/docker-container.service.js';
import { K8sContainerService } from '../container/k8s-container/k8s-container.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ConfigService } from '../config/config.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { DockerService } from '../docker/docker.service.js';

@Injectable()
export class CleanService {
  constructor(
    private readonly k8sContainerService: K8sContainerService,
    private readonly dockerContainerService: DockerContainerService,
    private readonly k8sService: K8sService,
    private readonly dockerService: DockerService,
    private readonly sqlService: SqlService,
    private readonly config: ConfigService,
    private readonly environmentService: EnvironmentService,
  ) {}

  public async clean(envName: string) {
    const environment = await this.config.getEnvironment(envName);
    this.environmentService.environment = environment;

    if (environment.platform === 'k8s') {
      this.k8sService.setup();
      this.k8sContainerService.setup();
      await this.sqlService.cleanUpAllDirectusUsers(this.k8sContainerService);
      this.k8sContainerService.cleanUpAll();
    } else {
      this.dockerService.setup();
      this.dockerContainerService.setup();
      await this.sqlService.cleanUpAllDirectusUsers(
        this.dockerContainerService,
      );
      this.dockerContainerService.cleanUpAll();
    }
  }
}
