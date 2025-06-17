import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import { ContainerService } from '../container/container.service.js';
import { DockerContainerService } from '../container/docker-container/docker-container.service.js';
import { K8sContainerService } from '../container/k8s-container/k8s-container.service.js';
import { DockerService } from '../docker/docker.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { PortForwardService } from '../k8s/port-forward/port-forward.service.js';
import { SqlService } from '../sql/sql.service.js';
import { MigrateDataPromptService } from './migrate-data-prompt/migrate-data-prompt.service.js';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';

@Injectable()
export class MigrateDataService {
  private containerServices: { [name: string]: ContainerService } = {};

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly config: ConfigService,
    private readonly dockerService: DockerService,
    private readonly portForwardService: PortForwardService,
    private readonly k8sService: K8sService,
    private readonly sqlService: SqlService,
    private readonly environmentService: EnvironmentService,
    private readonly migrateDataPromptService: MigrateDataPromptService,
  ) {}

  public async migrate(from: string, to: string) {
    try {
      const toEnv = this.config.getEnvironment(from);
      this.environmentService.environment = toEnv;
      const containerService = await this.prepareContainerService(to);
      const collections = await this.sqlService.listTables(containerService);
      const filteredCollections = await this.migrateDataPromptService.prompt({
        from,
        to,
        collections,
      });

      if (filteredCollections.length === 0) {
        this.logger.info('No collections selected');
        return;
      }

      await this.doubleCheck(filteredCollections.length);

      await this.migrateCollections(from, to, filteredCollections);
    } catch (error) {
      this.logger.error(error.message || error);
    } finally {
      this.logger.info('Cleaning up');
      await this.cleanUpEnv(from);
      await this.cleanUpEnv(to);
      this.portForwardService.stop();
    }
  }

  private async doubleCheck(collectionCount: number) {
    const environment = this.environmentService.environment;

    if (environment.doubleCheck) {
      const answer = await confirm({
        message: `Are you sure you want to migrate ${chalk.red(collectionCount)} collections to the environment ${chalk.red(environment.name)}?`,
        default: false,
      });

      if (!answer) {
        process.exit(0);
      }
    }
  }

  private async prepareContainerService(name: string) {
    const env = this.config.getEnvironment(name);
    this.environmentService.environment = env;
    await this.setupContainerService(name);
    return this.containerServices[name];
  }

  private async migrateCollections(
    from: string,
    to: string,
    collections: string[],
  ) {
    const fromContainerService = await this.prepareContainerService(from);
    await this.sqlService.performMysqlDump(fromContainerService, collections);
    await fromContainerService.exfilFile('/tmp/backup.sql', `/tmp/backup.sql`);
    const toContainerService = await this.prepareContainerService(to);
    await toContainerService.infilFile(`/tmp/backup.sql`, '/tmp/backup.sql');
    await this.sqlService.restoreMysqlDump(toContainerService);
  }

  private async setupContainerService(name: string) {
    let containerService: ContainerService;
    const env = this.config.getEnvironment(name);
    this.environmentService.environment = env;

    if (env.platform === 'k8s') {
      containerService = new K8sContainerService(this.logger, this.k8sService);
      await this.k8sService.setup();
    } else {
      containerService = new DockerContainerService(
        this.logger,
        this.dockerService,
      );
      await this.dockerService.setup();
    }

    await containerService.setup();
    this.containerServices[name] = containerService;
  }

  private async cleanUpEnv(name: string) {
    const env = this.config.getEnvironment(name);
    this.environmentService.environment = env;

    const containerService = this.containerServices[name];

    if (containerService) {
      await containerService.cleanUp();
    }

    if (env.platform === 'k8s') {
      await this.k8sService.cleanUp();
    }
  }
}
