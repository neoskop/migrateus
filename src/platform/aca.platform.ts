import { LoggerService } from '../logger/logger.service.js';
import { AcaService } from '../aca/aca.service.js';
import { AcaContainerService } from '../container/aca-container/aca-container.service.js';
import { Platform } from './platform.js';

export class AcaPlatform extends Platform {
  public readonly containerService: AcaContainerService;

  constructor(
    logger: LoggerService,
    private readonly acaService: AcaService,
  ) {
    super();
    this.containerService = new AcaContainerService(logger, acaService);
  }

  setup(): Promise<void> {
    return this.acaService.setup();
  }

  async forwardDirectus(): Promise<number> {
    // ACA reaches Directus on its standard port directly (no local forward).
    return 8055;
  }

  async teardown(): Promise<void> {
    // No port-forward or tunnel to stop.
  }

  restartDirectus(): Promise<void> {
    return this.acaService.restartDirectus();
  }
}
