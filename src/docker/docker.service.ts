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

@Injectable()
export class DockerService {
  public networks: string[];
  public containerConfig: ContainerConfig;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly environmentService: EnvironmentService,
    private readonly sqlService: SqlService,
  ) {}

  public setup() {
    this.containerConfig = this.getContainerConfig();
    this.networks = Object.keys(this.containerConfig.NetworkSettings.Networks);
    this.logger.debug(
      `Setting database config: ${highlight(JSON.stringify(this.databaseConfig), { language: 'json' })}`,
    );
    this.sqlService.databaseConfig = this.databaseConfig;
  }

  private getContainerConfig() {
    const inspectOutput = shell.exec(
      `docker inspect ${(this.environmentService.environment as DockerEnvironment).containerName}`,
      { silent: true },
    );
    return JSON.parse(inspectOutput.stdout)[0] as ContainerConfig;
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

  private getDockerEnvValue(name: string) {
    const variable = this.containerConfig.Config.Env.find((env: string) =>
      env.startsWith(name),
    );

    if (!variable) {
      throw new Error(`Environment variable ${name} not found`);
    }

    return variable.split('=')[1];
  }
}
