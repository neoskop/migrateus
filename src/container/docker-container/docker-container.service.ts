import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import shell, { ShellString } from 'shelljs';
import { Logger } from 'winston';
import { nanoid } from 'nanoid/non-secure';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import chalk from 'chalk';
import { DockerService } from '../../docker/docker.service.js';
import { highlight } from 'cli-highlight';

@Injectable()
export class DockerContainerService extends ContainerService {
  public migrateusContainerId: string;
  public mount: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly dockerService: DockerService,
  ) {
    super();
  }

  public setup(): void {
    const command = [
      'docker container create',
      `--name migrateus-${nanoid(6)}`,
    ];

    if (this.mount) {
      command.push('--mount', `type=bind,source=${this.mount},target=/tmp`);
    }

    for (const network of this.dockerService.networks) {
      command.push('--network', network);
    }

    command.push('bitnami/mysql:5.7.43');
    command.push('/bin/bash -c "sleep infinity"');

    this.logger.debug(
      `Creating container with command: ${highlight(command.join(' '), { language: 'bash' })}`,
    );

    this.migrateusContainerId = shell
      .exec(command.join(' '), {
        silent: true,
      })
      .stdout.trim();

    shell.exec(`docker start ${this.migrateusContainerId}`, { silent: true });
  }

  public cleanUp(): void {
    this.removeContainer(this.migrateusContainerId);
  }

  public cleanUpAll(): void {
    const containers = shell
      .exec(`docker ps -a -f name=migrateus --format '{{.Names}}'`, {
        silent: true,
      })
      .stdout.split('\n')
      .join(' ');

    if (containers.length > 0) {
      this.removeContainer(containers);
    }
  }

  public execute(command: string): ShellString {
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
    return shell.exec(fullCommand, { silent: true });
  }

  private removeContainer(container: string) {
    this.logger.debug(
      `Deleting container${container.includes(' ') ? 's' : ''} ${container
        .split(' ')
        .filter(Boolean)
        .map((name) => chalk.bold(name))
        .join(', ')}`,
    );
    shell.exec(`docker stop ${container}`, { silent: true });
    shell.exec(`docker rm ${container}`, { silent: true });
  }
}
