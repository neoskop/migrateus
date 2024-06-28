import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import { Logger } from 'winston';
import chalk from 'chalk';
import shell, { ShellString } from 'shelljs';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { customAlphabet } from 'nanoid/non-secure';
import { K8sEnvironment } from '../../config/environment.interface.js';

@Injectable()
export class K8sContainerService extends ContainerService {
  public migrateusPodName: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {
    super();
    this.migrateusPodName = `migrateus-${customAlphabet('abcdef1234567890')(6)}`;
  }

  public setup(): void {
    const output = shell.exec(
      `kubectl run ${this.migrateusPodName} --image=mysql -- bash -c "sleep infinity"`,
      { silent: true },
    );

    if (output.code !== 0) {
      throw new Error(
        `Failed to start pod with code ${output.code}: ${output.stderr}`,
      );
    }

    shell.exec(
      `kubectl wait --for=condition=ready pod ${this.migrateusPodName}`,
      { silent: true },
    );
  }

  public cleanUp(): void {
    this.logger.debug(`Deleting pod ${chalk.bold(this.migrateusPodName)}`);
    shell.exec(`kubectl delete pod ${this.migrateusPodName}`, { silent: true });
  }

  public cleanUpAll(): void {
    shell
      .exec(`kubectl get pods -oname`)
      .stdout.split('\n')
      .filter((line: string) => {
        line.startsWith(`pod/migrateus-`);
      })
      .forEach((resource: string) => {
        shell.exec(`kubectl delete ${resource}`, { silent: true });
      });
  }

  public execute(command: string): ShellString {
    this.logger.debug(
      `Executing ${chalk.bold(command)} in pod/${chalk.bold(this.migrateusPodName)}`,
    );
    return shell.exec(
      `kubectl exec ${this.migrateusPodName} -- bash -c "${command}"`,
      {
        silent: true,
      },
    );
  }
}
