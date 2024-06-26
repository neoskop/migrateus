import { Inject, Injectable } from '@nestjs/common';
import { DockerEnvironment } from '../../config/environment.interface.js';
import shell from 'shelljs';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import chalk from 'chalk';
import { DirectusUserService } from '../../directus/directus-user/directus-user.service.js';
import { nanoid } from 'nanoid';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { BackupPerformer } from '../backup-performer.js';
import { DatabaseConfig } from '../database-config.interface.js';

type ContainerConfig = {
  NetworkSettings: { Networks: string[] };
  Config: { Env: string[] };
  State: { Running: boolean };
  Id: string;
};

@Injectable()
export class DockerBackupService extends BackupPerformer<DockerEnvironment> {
  private migrateusContainerId: string;
  private containerConfig: ContainerConfig;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    directusUserService: DirectusUserService,
    directusAssetService: DirectusAssetService,
  ) {
    super(logger, directusUserService, directusAssetService);
  }

  protected async setup(environment: DockerEnvironment, backupDir: string) {
    this.containerConfig = this.getContainerConfig(environment);
    await this.ensureDatabaseContainerIsRunning();
    this.startMigrateusContainer(backupDir);
    await this.ensureDirectusContainerIsRunning();
  }

  protected async getDirectusPort(): Promise<number> {
    return 8055;
  }

  protected async cleanUp() {
    this.cleanUpMigrateusContainer();
  }

  private cleanUpMigrateusContainer() {
    shell.exec(`docker stop ${this.migrateusContainerId}`, { silent: true });
    shell.exec(`docker rm ${this.migrateusContainerId}`, { silent: true });
  }

  private startMigrateusContainer(backupDir: string) {
    const command = [
      'docker container create',
      `--name migrateus-${nanoid(6)}`,
      '-v',
      `${backupDir}:/tmp`,
    ];

    for (const networkName of Object.keys(
      this.containerConfig.NetworkSettings.Networks,
    )) {
      command.push('--network', networkName);
    }

    command.push('mysql');
    command.push('/bin/bash -c "while true ; do sleep 1 ; done"');

    this.migrateusContainerId = shell
      .exec(command.join(' '), {
        silent: true,
      })
      .stdout.trim();

    shell.exec(`docker start ${this.migrateusContainerId}`, { silent: true });
  }

  private async ensureDatabaseContainerIsRunning() {
    const networkNames = Object.keys(
      this.containerConfig.NetworkSettings.Networks,
    );
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
            networkNames.includes(network),
          ),
        )
        .filter(({ State }: { State: string }) => State !== 'running')
        .filter(({ Names }: { Names: string }) =>
          Names.split(',').some((Name: string) =>
            Name.includes(this.getDockerEnvValue('DB_HOST')),
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
    shell.exec(`docker start ${this.containerConfig.Id}`, { silent: true });
    return new Promise((resolve) => setTimeout(resolve, 10000));
  }

  private getContainerConfig(environment: DockerEnvironment) {
    const inspectOutput = shell.exec(
      `docker inspect ${environment.containerName}`,
      { silent: true },
    );
    return JSON.parse(inspectOutput.stdout)[0] as ContainerConfig;
  }

  protected getDatabaseConfig(): DatabaseConfig {
    return {
      host: this.getDockerEnvValue('DB_HOST'),
      port: this.getDockerEnvValue('DB_PORT'),
      name: this.getDockerEnvValue('DB_DATABASE'),
      user: this.getDockerEnvValue('DB_USER'),
      password: this.getDockerEnvValue('DB_PASSWORD'),
    };
  }

  protected executeInMigrateusContainer(command: string) {
    const fullCommand = `docker exec ${this.migrateusContainerId} /bin/bash -c "${command}"`;
    this.logger.debug(`Executing command: ${fullCommand}`);
    return shell.exec(fullCommand, { silent: true });
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
