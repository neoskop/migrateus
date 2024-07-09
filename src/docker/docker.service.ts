import { Inject, Injectable } from '@nestjs/common';
import { ContainerConfig } from './container-config.type.js';
import { EnvironmentService } from '../environment/environment.service.js';
import shell from 'shelljs';
import { DockerEnvironment } from '../config/environment.interface.js';
import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { SqlService } from '../sql/sql.service.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';

@Injectable()
export class DockerService {
  public networks: string[];
  public containerConfig: ContainerConfig;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly environmentService: EnvironmentService,
    private readonly sqlService: SqlService,
  ) {}

  public async setup() {
    this.containerConfig = this.getContainerConfig();
    this.logger.debug(
      `Container config: ${highlight(JSON.stringify(this.containerConfig), { language: 'json' })}`,
    );
    this.networks = Object.keys(this.containerConfig.NetworkSettings.Networks);
    this.logger.debug(
      `Setting database config: ${highlight(JSON.stringify(this.databaseConfig), { language: 'json' })}`,
    );
    this.sqlService.databaseConfig = this.databaseConfig;
    await this.ensureDatabaseContainerIsRunning();
    await this.ensureDirectusContainerIsRunning();
  }

  public get databaseConfig(): DatabaseConfig {
    return {
      host: this.getDockerEnvValue('DB_HOST'),
      port: this.getDockerEnvValue('DB_PORT'),
      name: this.getDockerEnvValue('DB_DATABASE'),
      user: this.getDockerEnvValue('DB_USER'),
      password: this.getDockerEnvValue('DB_PASSWORD'),
    };
  }

  private getContainerConfig() {
    const inspectOutput = shell.exec(
      `docker inspect ${(this.environmentService.environment as DockerEnvironment).containerName}`,
      { silent: true },
    );

    if (inspectOutput.code !== 0) {
      throw new Error(
        `Failed to get container config with code ${inspectOutput.code}: ${inspectOutput.stderr}`,
      );
    }

    return JSON.parse(inspectOutput.stdout)[0] as ContainerConfig;
  }

  private getDockerEnvValue(name: string) {
    const variable = this.containerConfig.Config.Env.find((env: string) =>
      env.startsWith(name),
    );

    if (!variable) {
      throw new Error(`Environment variable ${name} not found`);
    }

    return variable.split('=')[1];
  }

  private async ensureDatabaseContainerIsRunning() {
    const containersOutput = shell.exec('docker ps -a --format json', {
      silent: true,
    }).stdout;
    const containers = containersOutput
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return Promise.all(
      containers
        .filter(({ Networks }: { Networks: string }) =>
          Networks.split(',').some((network: string) =>
            this.networks.includes(network),
          ),
        )
        .filter(({ State }: { State: string }) => State !== 'running')
        .filter(({ Names }: { Names: string }) =>
          Names.split(',').some((Name: string) =>
            Name.includes(this.databaseConfig.host),
          ),
        )
        .map(({ ID }: { ID: string }) => {
          this.logger.debug(
            `Starting database container ${chalk.bold(ID)} since it is not running`,
          );
          shell.exec(`docker start ${ID}`, { silent: true });
          return new Promise((resolve) => setTimeout(resolve, 10000));
        }),
    );
  }

  private async ensureDirectusContainerIsRunning() {
    if (this.containerConfig.State.Running) {
      return;
    }

    this.logger.debug(
      `Starting Directus container ${chalk.bold(this.containerConfig.Id)} since it is not running`,
    );
    shell.exec(`docker start ${this.containerConfig.Id}`, {
      silent: true,
    });
    return new Promise((resolve) => setTimeout(resolve, 10000));
  }
}
