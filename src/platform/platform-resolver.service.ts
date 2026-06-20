import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { DockerService } from '../docker/docker.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { AcaService } from '../aca/aca.service.js';
import { PortForwardService } from '../k8s/port-forward/port-forward.service.js';
import { Platform } from './platform.js';
import { DockerPlatform } from './docker.platform.js';
import { K8sPlatform } from './k8s.platform.js';
import { AcaPlatform } from './aca.platform.js';
import { platformKey } from './platform-key.js';

/**
 * The single place in the codebase that branches on `environment.platform`.
 * Every consumer that used to hand-roll `if docker … else if aca … else k8s`
 * now resolves a {@link Platform} here instead. Returns a fresh instance per
 * call so callers handling two environments at once get independent handles.
 */
@Injectable()
export class PlatformResolver {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) private readonly logger: LoggerService,
    private readonly dockerService: DockerService,
    private readonly k8sService: K8sService,
    private readonly acaService: AcaService,
    private readonly portForwardService: PortForwardService,
  ) {}

  resolve(platform: string): Platform {
    switch (platformKey(platform)) {
      case 'docker':
        return new DockerPlatform(this.logger, this.dockerService);
      case 'aca':
        return new AcaPlatform(this.logger, this.acaService);
      case 'k8s':
        return new K8sPlatform(
          this.logger,
          this.k8sService,
          this.portForwardService,
        );
    }
  }
}
