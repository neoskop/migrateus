import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import portfinder from 'portfinder';
import { ChildProcess } from 'child_process';
import { K8sService } from '../k8s.service.js';

// ponytail: fixed ceiling, no backoff — enough to ride out a dropped tunnel,
// low enough that a deleted pod fails fast instead of respawning forever.
const MAX_RESTARTS = 3;

@Injectable()
export class PortForwardService {
  private forwards = new Map<number, ChildProcess>();
  private stopping = false;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly k8sService: K8sService,
  ) {}

  public async forward(): Promise<number> {
    this.stopping = false;
    const port = await portfinder.getPortPromise();
    await this.spawnForward(port, 0);
    return port;
  }

  /**
   * `kubectl port-forward` is not durable: the API server (or the load balancer
   * in front of it) drops the idle connection — typically while migrateus sits
   * on an interactive prompt — and kubectl exits, so the next request dies with
   * ECONNREFUSED. Re-forward the SAME local port, which keeps every URL a caller
   * already handed to the Directus SDK valid.
   */
  private async spawnForward(port: number, restarts: number): Promise<void> {
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
    this.forwards.set(port, portForward);
    portForward.unref();
    // kubectl explains itself on stderr ("lost connection to pod"); keep that in
    // the debug log but unref'd, so a stray pipe can never hold the CLI open.
    // A stdio pipe is a net.Socket under the hood, which `Readable` hides.
    (portForward.stderr as unknown as { unref?: () => void })?.unref?.();
    portForward.stderr?.on('data', (chunk: Buffer | string) =>
      this.logger.debug(`kubectl port-forward: ${String(chunk).trim()}`),
    );

    portForward.once('exit', (code, signal) => {
      // Ignore the exit we caused ourselves in stop().
      if (this.stopping || this.forwards.get(port) !== portForward) {
        return;
      }
      this.forwards.delete(port);
      this.logger.debug(
        `Port-forward on ${chalk.bold(port)} exited (code ${code}, signal ${signal})`,
      );

      if (restarts >= MAX_RESTARTS) {
        this.logger.warn(
          `Giving up on the port-forward for local port ${chalk.bold(port)} after ${MAX_RESTARTS} restarts`,
        );
        return;
      }

      void this.spawnForward(port, restarts + 1).catch((error: any) =>
        this.logger.warn(
          `Failed to re-establish the port-forward on ${chalk.bold(port)}: ${error?.message ?? error}`,
        ),
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  public stop() {
    this.stopping = true;
    for (const process of this.forwards.values()) {
      try {
        process.kill('SIGKILL');
      } catch (e: any) {
        this.logger.warn(`Failed to stop port-forward: ${e.message || e}`);
      }
    }
    // Forget them: a later stop() must not signal a PID we no longer own.
    this.forwards.clear();
  }
}
