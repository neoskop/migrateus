import { LoggerService } from '../logger/logger.service.js';
import { DockerService } from '../docker/docker.service.js';
import { DockerContainerService } from '../container/docker-container/docker-container.service.js';
import { Platform } from './platform.js';

export class DockerPlatform extends Platform {
  public readonly containerService: DockerContainerService;

  constructor(
    logger: LoggerService,
    private readonly dockerService: DockerService,
  ) {
    super();
    this.containerService = new DockerContainerService(logger, dockerService);
  }

  setup(): Promise<void> {
    return this.dockerService.setup();
  }

  // Remote docker (DOCKER_HOST=ssh://…) needs an SSH tunnel so the Directus
  // HTTP API is reachable on localhost; local docker returns 8055.
  forwardDirectus(): Promise<number> {
    return this.dockerService.forwardDirectus();
  }

  async teardown(): Promise<void> {
    this.dockerService.stopForwardDirectus();
  }

  restartDirectus(): Promise<void> {
    return this.dockerService.restartDirectus();
  }
}
