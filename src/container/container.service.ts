import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { ShellString } from 'shelljs';

export abstract class ContainerService {
  public databaseConfig: DatabaseConfig;

  public abstract setup(): void;

  public abstract cleanUp(): void;

  public abstract cleanUpAll(): void;

  public abstract execute(command: string): ShellString;
}
