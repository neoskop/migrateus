import { ContainerService } from '../container/container.service.js';

/** The Directus HTTP port and the container handle for a connected platform. */
export interface PlatformConnection {
  port: number;
  containerService: ContainerService;
}

/**
 * A single environment's deployment platform (docker / docker-compose, k8s or
 * ACA). Encapsulates everything that used to be hand-branched on
 * `environment.platform` at every call site: how to set up access, how to reach
 * the Directus HTTP API, how to tear down, and how to restart Directus.
 *
 * Each {@link ContainerService} holds per-environment state (a container/pod
 * id), so a {@link Platform} owns its own container service instance and the
 * resolver hands out a fresh `Platform` per call — operations that touch two
 * environments at once (schema-diff, migrate-data) get independent handles.
 */
export abstract class Platform {
  /** The container handle for SQL-level exec/copy against this environment. */
  abstract readonly containerService: ContainerService;

  /** Set up platform access (kube context, docker networks, ACA env + DB creds). */
  abstract setup(): Promise<void>;

  /** Resolve the Directus HTTP API to a locally-reachable port. Call after {@link setup}. */
  abstract forwardDirectus(): Promise<number>;

  /** Tear down platform access (stop port-forwards/tunnels, drop temp context). */
  abstract teardown(): Promise<void>;

  /** Restart the Directus container/pod/revision. */
  abstract restartDirectus(): Promise<void>;

  /** {@link setup} + {@link forwardDirectus}, returning the port and container handle. */
  async connect(): Promise<PlatformConnection> {
    await this.setup();
    const port = await this.forwardDirectus();
    return { port, containerService: this.containerService };
  }
}
