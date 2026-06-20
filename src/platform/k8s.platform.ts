import { LoggerService } from '../logger/logger.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { PortForwardService } from '../k8s/port-forward/port-forward.service.js';
import { K8sContainerService } from '../container/k8s-container/k8s-container.service.js';
import { Platform } from './platform.js';

export class K8sPlatform extends Platform {
  public readonly containerService: K8sContainerService;

  constructor(
    logger: LoggerService,
    private readonly k8sService: K8sService,
    private readonly portForwardService: PortForwardService,
  ) {
    super();
    this.containerService = new K8sContainerService(logger, k8sService);
  }

  setup(): Promise<void> {
    return this.k8sService.setup();
  }

  forwardDirectus(): Promise<number> {
    return this.portForwardService.forward();
  }

  async teardown(): Promise<void> {
    this.portForwardService.stop();
    await this.k8sService.cleanUp();
  }

  restartDirectus(): Promise<void> {
    return this.k8sService.restartDirectus();
  }
}
