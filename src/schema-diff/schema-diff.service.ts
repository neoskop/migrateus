import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { DirectusService } from '../directus/directus.service.js';
import {
  RestClient,
  schemaApply,
  schemaDiff,
  SchemaDiffOutput,
  schemaSnapshot,
  serverInfo,
} from '@directus/sdk';
import chalk from 'chalk';
import { DockerService } from '../docker/docker.service.js';
import { PortForwardService } from '../k8s/port-forward/port-forward.service.js';
import { K8sContainerService } from '../container/k8s-container/k8s-container.service.js';
import { DockerContainerService } from '../container/docker-container/docker-container.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { SqlService } from '../sql/sql.service.js';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';
import { ContainerService } from '../container/container.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import confirm from '@inquirer/confirm';
import semver from 'semver';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { SchemaDiffPromptService } from './schema-diff-prompt/schema-diff-prompt.service.js';
import { ProgressService } from '../progress/progress.service.js';

@Injectable()
export class SchemaDiffService {
  private containerServices: { [name: string]: ContainerService } = {};

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly config: ConfigService,
    private readonly directus: DirectusService,
    private readonly dockerService: DockerService,
    private readonly portForwardService: PortForwardService,
    private readonly k8sService: K8sService,
    private readonly sqlService: SqlService,
    private readonly directusUserService: DirectusUserService,
    private readonly environmentService: EnvironmentService,
    private readonly schemaDiffPromptService: SchemaDiffPromptService,
    private readonly progressService: ProgressService,
  ) {}

  public async diff(from: string, to: string) {
    try {
      const fromClient = await this.setupDirectusClient(from);
      const toClient = await this.setupDirectusClient(to);
      this.progressService.advance('🔎 Compare Directus versions');
      await this.checkVersions(from, fromClient, to, toClient);
      this.progressService.advance('📸 Get schema snapshot');
      const snapshot = await fromClient.request(schemaSnapshot());
      this.progressService.advance('🧬 Get schema diff');
      const diffOutput = await toClient.request<
        SchemaDiffOutput & { status: number }
      >(schemaDiff(snapshot, true));
      if (!diffOutput || diffOutput.status === 204) {
        this.progressService.succeed(
          `No changes between ${chalk.bold(from)} and ${chalk.bold(to)}`,
        );
      } else {
        if (this.config.schemaDiffSavePath) {
          this.logger.debug(
            `Saving diff to ${chalk.bold(this.config.schemaDiffSavePath)}`,
          );
          await fs.promises.writeFile(
            this.config.schemaDiffSavePath,
            yaml.dump(diffOutput),
          );
        }

        this.progressService.finish();
        const filteredDiff = await this.schemaDiffPromptService.prompt({
          from,
          to,
          diffOutput,
        });

        const changes =
          filteredDiff.diff.collections.length +
          filteredDiff.diff.fields.length +
          filteredDiff.diff.relations.length;

        if (changes > 0) {
          await this.doubleCheck(changes);
          this.progressService.advance(
            `Applying ${chalk.bold(changes)} changes!`,
          );
          await this.applyDiff(toClient, filteredDiff);
        } else {
          this.logger.debug(`No changes to apply - stopping!`);
        }
      }
    } catch (error) {
      this.progressService.fail(error.message || error);
    } finally {
      this.progressService.advance('🧹 Cleaning up');
      await this.cleanUpEnv(from);
      await this.cleanUpEnv(to);
      this.portForwardService.stop();
      this.progressService.finish();
    }
  }

  private async checkVersions(
    fromName: string,
    fromClient: RestClient<any>,
    toName: string,
    toClient: RestClient<any>,
  ) {
    const fromVersion = await this.getDirectusVersion(fromClient);
    const toVersion = await this.getDirectusVersion(toClient);

    if (fromVersion !== toVersion) {
      throw new Error(
        `Directus server versions mismatch. ${chalk.bold(fromName)} has ${semver.lt(fromVersion, toVersion) ? chalk.red(fromVersion) : chalk.green(fromVersion)}, while ${chalk.bold(toName)} has ${semver.lt(toVersion, fromVersion) ? chalk.red(toVersion) : chalk.green(toVersion)}`,
      );
    }
  }

  private async getDirectusVersion(client: RestClient<any>) {
    return (await client.request<{ version: string }>(serverInfo())).version;
  }

  private async doubleCheck(changes: number) {
    const environment = this.environmentService.environment;

    if (environment.doubleCheck) {
      const answer = await confirm({
        message: `Are you sure you want to apply ${chalk.red(changes)} changes to the environment ${chalk.red(environment.name)}?`,
        default: false,
      });

      if (!answer) {
        process.exit(0);
      }
    }
  }

  private async cleanUpEnv(name: string) {
    const env = this.config.getEnvironment(name);
    this.environmentService.environment = env;

    if (env.platform === 'k8s') {
      await this.k8sService.setup();
    } else {
      await this.dockerService.setup();
    }

    const containerService = this.containerServices[name];

    if (containerService) {
      await this.sqlService.cleanUpDirectusUser(containerService);
      await containerService.cleanUp();
    }

    if (env.platform === 'k8s') {
      await this.k8sService.cleanUp();
    }
  }

  private async setupDirectusClient(name: string): Promise<RestClient<any>> {
    let port = 8055;
    let containerService: ContainerService;
    const env = this.config.getEnvironment(name);
    this.environmentService.environment = env;

    if (env.platform === 'k8s') {
      this.progressService.advance(
        `🔌 Set-up port forward to Directus in Kubernetes (${chalk.bold(name)})`,
      );
      containerService = new K8sContainerService(this.logger, this.k8sService);
      await this.k8sService.setup();
      port = await this.portForwardService.forward();
    } else {
      containerService = new DockerContainerService(
        this.logger,
        this.dockerService,
      );
      await this.dockerService.setup();
    }

    this.progressService.advance(
      `🚀 Set-up Migrateus container for environment ${chalk.bold(name)}`,
    );
    await containerService.setup();
    this.containerServices[name] = containerService;
    this.progressService.advance(
      `👤 Set-up Directus user in environment ${chalk.bold(name)}`,
    );
    await this.sqlService.setupDirectusUser(containerService);
    return this.directus.getClient(port, this.directusUserService.token);
  }

  private async applyDiff(client: RestClient<any>, diff) {
    return await client.request(schemaApply(diff));
  }
}
