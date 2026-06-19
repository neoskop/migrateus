import { ExecOutputReturnValue } from 'shelljs';
import { DEFAULT_CONTAINER_IMAGE } from './container.constants.js';

export abstract class ContainerService {
  public image: string = DEFAULT_CONTAINER_IMAGE;

  public abstract setup(): Promise<void>;

  public abstract cleanUp(): Promise<void>;

  public abstract cleanUpAll(): Promise<void>;

  public abstract execute(command: string): Promise<ExecOutputReturnValue>;

  /** Runs a shell command inside the Directus container/pod (not the sidecar). */
  public abstract execInDirectus(
    command: string,
  ): Promise<ExecOutputReturnValue>;

  public abstract exfilFile(source: string, destination: string): Promise<void>;

  public abstract infilFile(source: string, destination: string): Promise<void>;

  public abstract copyFromDirectus(remotePath: string, localPath: string): Promise<void>;

  public abstract copyToDirectus(localPath: string, remotePath: string): Promise<void>;
}
