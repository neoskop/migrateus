import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import { Logger } from 'winston';
import chalk from 'chalk';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { customAlphabet } from 'nanoid/non-secure';
import { highlight } from 'cli-highlight';
import { K8sService } from '../../k8s/k8s.service.js';

@Injectable()
export class K8sContainerService extends ContainerService {
  public migrateusPodName: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly k8sService: K8sService,
  ) {
    super();
    this.migrateusPodName = `migrateus-${customAlphabet('abcdef1234567890')(6)}`;
  }

  public async setup() {
    const podSpec = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: this.migrateusPodName },
      spec: {
        activeDeadlineSeconds: 600,
        terminationGracePeriodSeconds: 0,
        containers: [
          {
            name: 'mysql',
            image: this.image,
            command: ['bash', '-c', 'sleep infinity'],
          },
        ],
      },
    };

    const output = await this.k8sService.kubectlApply(podSpec);

    if (output.code !== 0) {
      throw new Error(
        `Failed to start pod with code ${output.code}: ${output.stderr}`,
      );
    }

    await this.k8sService.kubectl(
      `wait --for=condition=ready --timeout=60s pod ${this.migrateusPodName}`,
      { silent: true },
    );
  }

  public async cleanUp() {
    this.logger.debug(`Deleting pod ${chalk.bold(this.migrateusPodName)}`);
    await this.k8sService.kubectl(
      `delete pod --ignore-not-found=true ${this.migrateusPodName}`,
      {
        silent: true,
      },
    );
  }

  public async cleanUpAll() {
    const resources = (
      await this.k8sService.kubectl(`get pods -oname`, { silent: true })
    ).stdout
      .split('\n')
      .filter((line: string) => line.startsWith(`pod/migrateus-`));

    if (resources.length > 0) {
      this.logger.debug(`Deleting ${chalk.bold(resources.length)} pods`);
      await this.k8sService.kubectl(`delete ${resources.join(' ')}`, {
        silent: true,
      });
    }
  }

  public async execute(command: string) {
    this.logger.debug(
      `Executing ${highlight(command, { language: 'bash' })} in pod/${chalk.bold(this.migrateusPodName)}`,
    );
    return await this.k8sService.kubectl(
      `exec ${this.migrateusPodName} -- bash -c "${command}"`,
      {
        silent: true,
      },
    );
  }

  public async exfilFile(source: string, destination: string): Promise<void> {
    const ouput = await this.k8sService.kubectl(
      `cp ${this.migrateusPodName}:${source} ${destination}`,
      { silent: true },
    );

    if (ouput.code !== 0) {
      throw new Error(
        `Failed to copy ${this.migrateusPodName}:${chalk.bold(source)} to ${chalk.bold(destination)}: ${ouput.stderr}`,
      );
    }
  }

  public async infilFile(source: string, destination: string): Promise<void> {
    const ouput = await this.k8sService.kubectl(
      `cp ${source} ${this.migrateusPodName}:${destination}`,
      { silent: true },
    );

    if (ouput.code !== 0) {
      throw new Error(
        `Failed to copy ${chalk.bold(source)} to ${this.migrateusPodName}:${chalk.bold(destination)}: ${ouput.stderr}`,
      );
    }
  }
}
