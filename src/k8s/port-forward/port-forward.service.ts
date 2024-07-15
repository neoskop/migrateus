import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import portfinder from 'portfinder';
import { ChildProcess, spawn } from 'child_process';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { exec } from '../../util/exec.js';

@Injectable()
export class PortForwardService {
  private forwards: ChildProcess[] = [];

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {}

  public async forward(): Promise<number> {
    const port = await portfinder.getPortPromise();
    const podName = (
      await exec(`kubectl get pod -l app.kubernetes.io/name=directus -oname`, {
        silent: true,
      })
    ).stdout.split('\n')[0];
    this.logger.debug(
      `Forwarding local port ${chalk.bold(port)} to ${chalk.bold('8055')} in ${chalk.bold(podName)}`,
    );

    const portForward = spawn(
      'kubectl',
      ['port-forward', podName, `${port}:8055`],
      {
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true,
      },
    );

    this.forwards.push(portForward);
    portForward.unref();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return port;
  }

  public stop() {
    this.forwards.forEach((process) => {
      try {
        process.kill('SIGKILL');
      } catch (e) {
        this.logger.warn(`Failed to stop port-forward: ${e.message || e}`);
      }
    });
  }
}
