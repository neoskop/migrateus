import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import { nanoid } from 'nanoid/non-secure';
import chalk from 'chalk';
import { DockerService } from '../../docker/docker.service.js';
import { highlight } from 'cli-highlight';
import os from 'node:os';
import { exec, throwIfFailed } from '../../util/exec.js';

@Injectable()
export class DockerContainerService extends ContainerService {
  public migrateusContainerId: string;
  public mount: string;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly dockerService: DockerService,
  ) {
    super();
  }

  public async setup() {
    const userInfo = os.userInfo();
    const command = [
      'docker container create',
      `--name migrateus-${nanoid(6)}`,
      `--user ${userInfo.uid}:${userInfo.gid}`,
    ];

    if (this.mount) {
      command.push('--mount', `type=bind,source=${this.mount},target=/tmp`);
    }

    for (const network of this.dockerService.networks) {
      command.push('--network', network);
    }

    command.push(this.image);
    command.push('/bin/bash -c "sleep infinity"');

    this.logger.debug(
      `Creating container with command: ${highlight(command.join(' '), { language: 'bash' })}`,
    );

    const createOutput = throwIfFailed(
      await exec(this.dockerService.withHost(command.join(' ')), {
        silent: true,
      }),
      (o) => `Failed to create container with code ${o.code}: ${o.stderr}`,
    );

    this.migrateusContainerId = createOutput.stdout.trim();

    throwIfFailed(
      await exec(
        this.dockerService.withHost(
          `docker start ${this.migrateusContainerId}`,
        ),
        { silent: true },
      ),
      (o) => `Failed to start container with code ${o.code}: ${o.stderr}`,
    );
  }

  public async cleanUp() {
    await this.removeContainer(this.migrateusContainerId);
  }

  public async cleanUpAll() {
    const containers = (
      await exec(
        this.dockerService.withHost(
          `docker ps -a -f name=migrateus --format '{{.Names}}'`,
        ),
        {
          silent: true,
        },
      )
    ).stdout
      .split('\n')
      .join(' ');

    if (containers.length > 0) {
      await this.removeContainer(containers);
    }
  }

  public async execute(command: string) {
    const fullCommand = [
      'docker',
      'exec',
      this.migrateusContainerId,
      '/bin/bash',
      '-c',
      `"${command.replaceAll(/\n/g, ' ')}"`,
    ].join(' ');
    this.logger.debug(
      `Executing ${highlight(fullCommand, { language: 'bash' })}`,
    );
    return await exec(this.dockerService.withHost(fullCommand), {
      silent: true,
    });
  }

  public execInDirectus(command: string) {
    return this.dockerService.execInDirectus(command);
  }

  private async removeContainer(container: string) {
    this.logger.debug(
      `Deleting container${container.includes(' ') ? 's' : ''} ${container
        .split(' ')
        .filter(Boolean)
        .map((name) => chalk.bold(name))
        .join(', ')}`,
    );
    await exec(this.dockerService.withHost(`docker rm -f ${container}`), {
      silent: true,
    });
  }

  public async exfilFile(source: string, destination: string): Promise<void> {
    const command = [
      'docker',
      'cp',
      `${this.migrateusContainerId}:${source}`,
      destination,
    ].join(' ');
    this.logger.debug(`Executing ${highlight(command, { language: 'bash' })}`);
    throwIfFailed(
      await exec(this.dockerService.withHost(command), { silent: true }),
      (o) =>
        `Failed to copy ${this.migrateusContainerId}:${chalk.bold(source)} to ${chalk.bold(destination)}: ${o.stderr}`,
    );
  }

  public async infilFile(source: string, destination: string): Promise<void> {
    const command = [
      'docker',
      'cp',
      source,
      `${this.migrateusContainerId}:${destination}`,
    ].join(' ');
    this.logger.debug(`Executing ${highlight(command, { language: 'bash' })}`);
    throwIfFailed(
      await exec(this.dockerService.withHost(command), { silent: true }),
      (o) =>
        `Failed to copy ${chalk.bold(source)} to ${this.migrateusContainerId}:${chalk.bold(destination)}: ${o.stderr}`,
    );
  }

  public async copyFromDirectus(
    remotePath: string,
    localPath: string,
  ): Promise<void> {
    const directusId = this.dockerService.containerConfig.Id;
    const command = [
      'docker',
      'cp',
      `${directusId}:${remotePath}`,
      localPath,
    ].join(' ');
    this.logger.debug(`Executing ${highlight(command, { language: 'bash' })}`);
    throwIfFailed(
      await exec(this.dockerService.withHost(command), { silent: true }),
      (o) =>
        `Failed to copy ${directusId}:${chalk.bold(remotePath)} to ${chalk.bold(localPath)}: ${o.stderr}`,
    );
  }

  public async copyToDirectus(
    localPath: string,
    remotePath: string,
  ): Promise<void> {
    const directusId = this.dockerService.containerConfig.Id;
    const command = [
      'docker',
      'cp',
      localPath,
      `${directusId}:${remotePath}`,
    ].join(' ');
    this.logger.debug(`Executing ${highlight(command, { language: 'bash' })}`);
    throwIfFailed(
      await exec(this.dockerService.withHost(command), { silent: true }),
      (o) =>
        `Failed to copy ${chalk.bold(localPath)} to ${directusId}:${chalk.bold(remotePath)}: ${o.stderr}`,
    );
  }
}
