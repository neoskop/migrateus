import { Logger } from 'winston';
import { DatabaseConfig } from '../../backup-db/database-config.interface.js';
import { DbDriver } from './db-driver.interface.js';
import { MysqlDriver } from './mysql.driver.js';
import { PostgresDriver } from './postgres.driver.js';
import { SqliteDriver } from './sqlite.driver.js';

export function createDbDriver(config: DatabaseConfig, logger: Logger): DbDriver {
  const client = config.client ?? 'mysql';
  switch (client) {
    case 'mysql':
      return new MysqlDriver(config, logger);
    case 'pg':
      return new PostgresDriver(config, logger);
    case 'sqlite3':
      return new SqliteDriver(config, logger);
    default:
      throw new Error(`Unsupported database client: ${client}`);
  }
}
