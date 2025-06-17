import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { ExecOutputReturnValue } from 'shelljs';
import { ContainerModule } from './container.module.js';

export abstract class ContainerService {
  public databaseConfig: DatabaseConfig;
  public image: string = ContainerModule.DEFAULT_IMAGE;

  public abstract setup(): Promise<void>;

  public abstract cleanUp(): Promise<void>;

  public abstract cleanUpAll(): Promise<void>;

  public abstract execute(command: string): Promise<ExecOutputReturnValue>;

  public abstract exfilFile(source: string, destination: string): Promise<void>;

  public abstract infilFile(source: string, destination: string): Promise<void>;
}
