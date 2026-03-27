import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import portfinder from 'portfinder';
import { ChildProcess } from 'child_process';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { K8sService } from '../k8s.service.js';

@Injectable()
export class PortForwardService {
  private forwards: ChildProcess[] = [];

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly k8sService: K8sService,
  ) {}

  public async forward(): Promise<number> {
    const port = await portfinder.getPortPromise();
    const podName = (
      await this.k8sService.kubectl(
        `get pod -l app.kubernetes.io/name=directus -oname`,
        {
          silent: true,
        },
      )
    ).stdout.split('\n')[0];
    this.logger.debug(
      `Forwarding local port ${chalk.bold(port)} to ${chalk.bold('8055')} in ${chalk.bold(podName)}`,
    );

    const portForward = this.k8sService.portForward(podName, port, 8055);
    this.forwards.push(portForward);
    portForward.unref();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return port;
  }

  public stop() {
    this.forwards.forEach((process) => {
      try {
        process.kill('SIGKILL');
      } catch (e: any) {
        this.logger.warn(`Failed to stop port-forward: ${e.message || e}`);
      }
    });
  }
}
