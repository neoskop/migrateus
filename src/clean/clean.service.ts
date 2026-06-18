import { Injectable } from '@nestjs/common';
import { DockerContainerService } from '../container/docker-container/docker-container.service.js';
import { K8sContainerService } from '../container/k8s-container/k8s-container.service.js';
import { AcaContainerService } from '../container/aca-container/aca-container.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ConfigService } from '../config/config.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { DockerService } from '../docker/docker.service.js';
import { AcaService } from '../aca/aca.service.js';
import { ProgressService } from '../progress/progress.service.js';

@Injectable()
export class CleanService {
  constructor(
    private readonly k8sContainerService: K8sContainerService,
    private readonly dockerContainerService: DockerContainerService,
    private readonly acaContainerService: AcaContainerService,
    private readonly k8sService: K8sService,
    private readonly dockerService: DockerService,
    private readonly acaService: AcaService,
    private readonly sqlService: SqlService,
    private readonly config: ConfigService,
    private readonly environmentService: EnvironmentService,
    private readonly progressService: ProgressService,
  ) { }

  public async clean(environmentName: string) {
    const environment = this.config.getEnvironment(environmentName);
    this.environmentService.environment = environment;

    try {
      let cleaningFunction: () => Promise<void>;
      if (environment.platform.startsWith('docker')) {
        cleaningFunction = this.cleanDocker;
      } else if (environment.platform === 'aca') {
        cleaningFunction = this.cleanAca;
      } else {
        cleaningFunction = this.cleanK8s;
      }
      await cleaningFunction.call(this);
    } catch (error: any) {
      this.progressService.fail(error);
    }
  }

  private async cleanDocker() {
    this.progressService.advance(
      '🔍 Gathering info on and starting containers',
    );
    await this.dockerService.setup();
    this.progressService.advance('🚀 Set-up Migrateus container');
    await this.dockerContainerService.setup();
    this.progressService.advance('🛁 Clean-up all Migrateus users');
    await this.sqlService.cleanUpAllDirectusUsers(this.dockerContainerService);
    this.progressService.advance('🗑️ Remove old Migrateus containers');
    await this.dockerContainerService.cleanUpAll();
    this.progressService.finish();
  }

  private async cleanAca() {
    this.progressService.advance(
      '🔑 Set up ACA environment and gather database credentials',
    );
    await this.acaService.setup();
    this.progressService.advance('🚀 Set-up Migrateus ACA container');
    await this.acaContainerService.setup();
    this.progressService.advance('🛁 Clean-up all Migrateus users');
    await this.sqlService.cleanUpAllDirectusUsers(this.acaContainerService);
    this.progressService.advance('🗑️ Remove old Migrateus ACA container apps');
    await this.acaContainerService.cleanUpAll();
    this.progressService.finish();
  }

  private async cleanK8s() {
    this.progressService.advance(
      '🔑 Set Kubernetes context and gather database credentials',
    );
    await this.k8sService.setup();
    this.progressService.advance('🚀 Set-up Migrateus pod');
    await this.k8sContainerService.setup();
    this.progressService.advance('🛁 Clean-up all Migrateus users');
    await this.sqlService.cleanUpAllDirectusUsers(this.k8sContainerService);
    this.progressService.advance('🗑️ Remove old Migrateus pods');
    await this.k8sContainerService.cleanUpAll();
    await this.k8sService.cleanUp();
    this.progressService.finish();
  }
}
