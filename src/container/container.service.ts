import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { ExecOutputReturnValue } from 'shelljs';

export abstract class ContainerService {
  public databaseConfig: DatabaseConfig;

  public abstract setup(): Promise<void>;

  public abstract cleanUp(): Promise<void>;

  public abstract cleanUpAll(): Promise<void>;

  public abstract execute(command: string): Promise<ExecOutputReturnValue>;
}
