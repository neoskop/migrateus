import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import { nanoid } from 'nanoid/non-secure';
import chalk from 'chalk';
import { DockerService } from '../../docker/docker.service.js';
import { highlight } from 'cli-highlight';
import os from 'node:os';
import { exec } from '../../util/exec.js';

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

    const createOutput = await exec(
      this.dockerService.withHost(command.join(' ')),
      {
        silent: true,
      },
    );

    if (createOutput.code !== 0) {
      throw new Error(
        `Failed to create container with code ${createOutput.code}: ${createOutput.stderr}`,
      );
    }

    this.migrateusContainerId = createOutput.stdout.trim();

    const output = await exec(
      this.dockerService.withHost(`docker start ${this.migrateusContainerId}`),
      {
        silent: true,
      },
    );

    if (output.code !== 0) {
      throw new Error(
        `Failed to start container with code ${output.code}: ${output.stderr}`,
      );
    }
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
    const ouput = await exec(this.dockerService.withHost(command), {
      silent: true,
    });

    if (ouput.code !== 0) {
      throw new Error(
        `Failed to copy ${this.migrateusContainerId}:${chalk.bold(source)} to ${chalk.bold(destination)}: ${ouput.stderr}`,
      );
    }
  }

  public async infilFile(source: string, destination: string): Promise<void> {
    const command = [
      'docker',
      'cp',
      source,
      `${this.migrateusContainerId}:${destination}`,
    ].join(' ');
    this.logger.debug(`Executing ${highlight(command, { language: 'bash' })}`);
    const ouput = await exec(this.dockerService.withHost(command), {
      silent: true,
    });

    if (ouput.code !== 0) {
      throw new Error(
        `Failed to copy ${chalk.bold(source)} to ${this.migrateusContainerId}:${chalk.bold(destination)}: ${ouput.stderr}`,
      );
    }
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
    const output = await exec(this.dockerService.withHost(command), {
      silent: true,
    });

    if (output.code !== 0) {
      throw new Error(
        `Failed to copy ${directusId}:${chalk.bold(remotePath)} to ${chalk.bold(localPath)}: ${output.stderr}`,
      );
    }
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
    const output = await exec(this.dockerService.withHost(command), {
      silent: true,
    });

    if (output.code !== 0) {
      throw new Error(
        `Failed to copy ${chalk.bold(localPath)} to ${directusId}:${chalk.bold(remotePath)}: ${output.stderr}`,
      );
    }
  }
}
