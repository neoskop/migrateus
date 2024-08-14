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
import expand from '@inquirer/expand';
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
  ) {}

  public async diff(from: string, to: string) {
    try {
      const fromClient = await this.setupDirectusClient(from);
      const toClient = await this.setupDirectusClient(to);
      await this.checkVersions(from, fromClient, to, toClient);
      const snapshot = await fromClient.request(schemaSnapshot());
      const diffResponse = await toClient.request<
        SchemaDiffOutput & { status: number }
      >(schemaDiff(snapshot, true));

      if (diffResponse.status === 204) {
        this.logger.info(
          `No changes between ${chalk.bold(from)} and ${chalk.bold(to)}`,
        );
      } else {
        if (diffResponse.diff.collections.length > 0) {
          diffResponse.diff.collections = await this.processDiffs(
            diffResponse.diff.collections,
          );
        }

        if (diffResponse.diff.fields.length > 0) {
          diffResponse.diff.fields = await this.processDiffs(
            diffResponse.diff.fields,
          );
        }

        if (diffResponse.diff.relations.length > 0) {
          diffResponse.diff.relations = await this.processDiffs(
            diffResponse.diff.relations,
          );
        }

        const changes =
          diffResponse.diff.collections.length +
          diffResponse.diff.fields.length +
          diffResponse.diff.relations.length;

        if (changes > 0) {
          await this.doubleCheck(changes);
          this.logger.info(`Will apply ${chalk.bold(changes)} changes!`);
          await this.applyDiff(toClient, diffResponse);
        } else {
          this.logger.info(`No changes to apply!`);
        }
      }
    } catch (error) {
      this.logger.error(error.message || error);
    } finally {
      this.logger.info('Cleaning up');
      await this.cleanUpEnv(from);
      await this.cleanUpEnv(to);
      this.portForwardService.stop();
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
    const env = await this.config.getEnvironment(name);
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
    const env = await this.config.getEnvironment(name);
    this.environmentService.environment = env;

    if (env.platform === 'k8s') {
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

    await containerService.setup();
    this.containerServices[name] = containerService;
    await this.sqlService.setupDirectusUser(containerService);
    return this.directus.getClient(port, this.directusUserService.token);
  }

  private coloredChangeSummary(change) {
    const colorMap = {
      E: { count: 0, color: chalk.whiteBright.bgYellow },
      N: { count: 0, color: chalk.whiteBright.bgGreen },
      D: { count: 0, color: chalk.whiteBright.bgRed },
    };

    change.diff.forEach((field) => {
      colorMap[field.kind].count++;
    });

    let result = '';

    Object.values(colorMap).forEach(({ count, color }) => {
      if (count > 0) {
        result += color(` ${count} `);
      }
    });

    return result;
  }

  private async promptDecision(diff) {
    const choice = await expand({
      message: `Accept changes to ${chalk.bold(
        diff.field ? diff.collection + '.' + diff.field : diff.collection,
      )} ${this.coloredChangeSummary(diff)}?`,
      default: 'y',
      choices: [
        {
          key: 'y',
          name: 'Accept change',
          value: 'accept',
        },
        {
          key: 'n',
          name: 'Decline change',
          value: 'decline',
        },
        {
          key: 'd',
          name: 'Show details',
          value: 'details',
        },
      ],
    });

    if (choice === 'accept') {
      return true;
    } else if (choice === 'decline') {
      return false;
    } else if (choice === 'details') {
      console.dir(diff, { depth: null, colors: true });
      return this.promptDecision(diff);
    }
  }

  private async processDiffs(diffs) {
    const results = [];
    for (const diff of diffs) {
      const decision = await this.promptDecision(diff);
      if (decision) {
        results.push(diff);
      }
    }
    return results;
  }

  private async applyDiff(client: RestClient<any>, diff) {
    return await client.request(schemaApply(diff));
  }
}
