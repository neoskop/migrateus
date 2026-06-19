import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { EnvironmentService } from '../environment/environment.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { ContainerService } from '../container/container.service.js';
import { K8sContainerService } from '../container/k8s-container/k8s-container.service.js';
import { DockerContainerService } from '../container/docker-container/docker-container.service.js';
import { AcaContainerService } from '../container/aca-container/aca-container.service.js';
import { SqlService } from '../sql/sql.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { DockerService } from '../docker/docker.service.js';
import { AcaService } from '../aca/aca.service.js';
import { assertSafeIdentifier } from '../sql/sql-escape.js';

@Injectable()
export class RenameCollectionService {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly config: ConfigService,
    private readonly environmentService: EnvironmentService,
    @Inject('ContainerServices')
    private readonly containerServices: { [name: string]: any },
    private readonly progressService: ProgressService,
    private readonly sqlService: SqlService,
    private readonly k8sService: K8sService,
    private readonly dockerService: DockerService,
    private readonly acaService: AcaService,
    private readonly acaContainerService: AcaContainerService,
  ) {}

  public async renameCollection(
    environmentName: string,
    oldName: string,
    newName: string,
  ) {
    assertSafeIdentifier(oldName, 'oldName');
    assertSafeIdentifier(newName, 'newName');

    const containerService =
      await this.prepareContainerService(environmentName);

    try {
      const environment = this.config.getEnvironment(environmentName);
      this.environmentService.environment = environment;
      this.progressService.advance(
        `🚀 Rename collection ${chalk.bold(oldName)} to ${chalk.bold(newName)}`,
      );
      const tableExists = await this.sqlService
        .listTables(containerService)
        .then((tables) => tables.includes(oldName));

      if (tableExists) {
        const alterTableStatement = `ALTER TABLE ${this.sqlService.escapeIdentifier(oldName)} RENAME TO ${this.sqlService.escapeIdentifier(newName)};`;
        await this.sqlService.executeSql(alterTableStatement, containerService);
      }

      const oldLiteral = this.sqlService.escapeString(oldName);
      const newLiteral = this.sqlService.escapeString(newName);
      const groupCol = this.sqlService.escapeIdentifier('group');

      const otherStatements = [
        `${this.sqlService.disableForeignKeys()};`,
        `UPDATE directus_collections SET ${groupCol} = ${newLiteral} WHERE ${groupCol} = ${oldLiteral};`,
        `UPDATE directus_collections SET collection = ${newLiteral} WHERE collection = ${oldLiteral};`,
        `UPDATE directus_fields SET collection = ${newLiteral} WHERE collection = ${oldLiteral};`,
        `UPDATE directus_relations SET many_collection = ${newLiteral} WHERE many_collection = ${oldLiteral};`,
        `UPDATE directus_relations SET one_collection = ${newLiteral} WHERE one_collection = ${oldLiteral};`,
        `UPDATE directus_permissions SET collection = ${newLiteral} WHERE collection = ${oldLiteral};`,
        `${this.sqlService.enableForeignKeys()};`,
      ];

      await this.sqlService.executeSql(
        otherStatements.join('\n'),
        containerService,
      );
      this.progressService.finish();
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🧹 Cleaning up');
      await containerService.cleanUp();
      this.progressService.finish();
    }
  }

  private async prepareContainerService(name: string) {
    if (!this.containerServices[name]) {
      this.progressService.advance(
        `🚀 Set-up Migrateus container for environment ${chalk.bold(name)}`,
      );
      const env = this.config.getEnvironment(name);
      this.environmentService.environment = env;
      await this.setupContainerService(name);
    }

    return this.containerServices[name];
  }

  private async setupContainerService(name: string) {
    let containerService: ContainerService;
    const env = this.config.getEnvironment(name);
    this.environmentService.environment = env;

    if (env.platform === 'k8s') {
      containerService = new K8sContainerService(this.logger, this.k8sService);
      await this.k8sService.setup();
    } else if (env.platform === 'aca') {
      containerService = this.acaContainerService;
      await this.acaService.setup();
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
}
