import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import { Logger } from 'winston';
import chalk from 'chalk';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { customAlphabet } from 'nanoid/non-secure';
import { highlight } from 'cli-highlight';
import { exec } from '../../util/exec.js';

@Injectable()
export class K8sContainerService extends ContainerService {
  public migrateusPodName: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
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

    const output = await exec(
      `echo '${JSON.stringify(podSpec)}' | kubectl apply -f -`,
      {
        silent: true,
      },
    );

    if (output.code !== 0) {
      throw new Error(
        `Failed to start pod with code ${output.code}: ${output.stderr}`,
      );
    }

    await exec(
      `kubectl wait --for=condition=ready pod ${this.migrateusPodName}`,
      { silent: true },
    );
  }

  public async cleanUp() {
    this.logger.debug(`Deleting pod ${chalk.bold(this.migrateusPodName)}`);
    await exec(`kubectl delete pod ${this.migrateusPodName}`, { silent: true });
  }

  public async cleanUpAll() {
    const resources = (
      await exec(`kubectl get pods -oname`, { silent: true })
    ).stdout
      .split('\n')
      .filter((line: string) => line.startsWith(`pod/migrateus-`));

    if (resources.length > 0) {
      this.logger.debug(`Deleting ${chalk.bold(resources.length)} pods`);
      await exec(`kubectl delete ${resources.join(' ')}`, { silent: true });
    }
  }

  public async execute(command: string) {
    this.logger.debug(
      `Executing ${highlight(command, { language: 'bash' })} in pod/${chalk.bold(this.migrateusPodName)}`,
    );
    return await exec(
      `kubectl exec ${this.migrateusPodName} -- bash -c "${command}"`,
      {
        silent: true,
      },
    );
  }
}
