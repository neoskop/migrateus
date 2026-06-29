import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';
import { highlight } from 'cli-highlight';
import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { ContainerService } from '../container/container.service.js';
import { Credential } from '../directus/directus-user/credential.type.js';
import { RedactService } from '../redact/redact.service.js';
import { DbDriver, Exec } from './db-driver/db-driver.interface.js';
import { createDbDriver } from './db-driver/db-driver.factory.js';
import { TransferPlanner } from '../transfer/transfer-planner.js';
import { DirectusService } from '../directus/directus.service.js';

@Injectable()
export class SqlService {
  private _driver: DbDriver;
  private _config: DatabaseConfig;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly directusUserService: DirectusUserService,
    private readonly redactService: RedactService,
    private readonly transferPlanner: TransferPlanner,
    private readonly directus: DirectusService,
  ) {}

  public set databaseConfig(config: DatabaseConfig) {
    this._config = config;
    this.redactService.addRedaction(`-p${config.password}`, { prefix: '-p' });
    this.redactService.addRedaction(config.password);
    // The pg driver ships the password base64-encoded; redact that form too so
    // it never leaks (trivially decodable) into debug logs.
    if (config.password) {
      this.redactService.addRedaction(
        Buffer.from(config.password).toString('base64'),
      );
    }
    this.logger.debug(
      `Database config: ${highlight(JSON.stringify(config), { language: 'json' })}`,
    );
    this._driver = createDbDriver(config, this.logger);
  }

  public get client(): DbDriver['client'] {
    return this._driver.client;
  }

  public get clientImage(): string {
    return this._driver.clientImage;
  }

  public get usesSidecar(): boolean {
    return this._driver.usesSidecar;
  }

  public get databaseFilename(): string | undefined {
    return this._config?.filename ?? this._config?.name;
  }

  private get driver(): DbDriver {
    return this._driver;
  }

  private execFor(containerService: ContainerService): Exec {
    // Server engines (mysql/pg) reach the DB over the network from the sidecar.
    // File-based engines (SQLite) keep the DB *inside* the Directus container,
    // so their SQL must run there — the sidecar has no database file.
    return this._driver.usesSidecar
      ? (command: string) => containerService.execute(command)
      : (command: string) => containerService.execInDirectus(command);
  }

  /**
   * Creates the engine-agnostic temporary Directus admin via the Directus CLI
   * (run inside the Directus container) and logs in for an access token. The
   * `port` is the Directus HTTP port reachable from this process (8055 for
   * docker, the forwarded port for k8s).
   */
  public async setupDirectusUser(
    containerService: ContainerService,
    port: number,
  ) {
    await this.directusUserService.setupUser(
      (command) => containerService.execInDirectus(command),
      (p, token) => this.directus.getClient(p, token),
      port,
    );
  }

  public async cleanUpDirectusUser() {
    // removeUser self-guards when the temp admin was never created (setup
    // failed before setupDirectusUser ran), so this is a safe no-op then.
    await this.directusUserService.removeUser();
  }

  public async cleanUpAllDirectusUsers(containerService: ContainerService) {
    if (!this._driver) {
      return { users: 0, roles: 0, policies: 0 };
    }
    const counts = await this.directusUserService.cleanUp(this._driver, (sql) =>
      this._driver.executeSql(this.execFor(containerService), sql),
    );
    this.logger.info(
      `Removed Migrateus leftovers: ${counts.users} user(s), ${counts.roles} role(s), ${counts.policies} policy(ies)`,
    );
    return counts;
  }

  public async setCredentials(
    credentials: Credential[],
    containerService: ContainerService,
  ) {
    if (!credentials || credentials.length === 0) {
      return;
    }
    await this.directusUserService.setCredentials(
      credentials,
      this._driver,
      (sql) => this._driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async setAssetStorage(
    storage: string,
    containerService: ContainerService,
  ) {
    if (!storage) {
      return;
    }
    const escaped = this._driver.escapeString(storage);
    await this._driver.executeSql(
      this.execFor(containerService),
      `UPDATE directus_files SET storage = ${escaped} WHERE storage <> ${escaped} OR storage IS NULL;`,
    );
  }

  public async performMysqlDump(
    containerService: ContainerService,
    tableNames?: string[],
  ) {
    await this._driver.dump(
      this.execFor(containerService),
      '/tmp/backup.sql',
      tableNames,
    );
  }

  public async restoreMysqlDump(containerService: ContainerService) {
    const exec = this.execFor(containerService);
    await this._driver.restore(exec, '/tmp/backup.sql');
    await this._driver.postRestoreFixups(exec);
  }

  public async dropAllTables(containerService: ContainerService) {
    await this._driver.dropAllTables(this.execFor(containerService));
  }

  public async transferRestore(
    containerService: ContainerService,
    sourceClient: 'mysql' | 'pg' | 'sqlite3',
    sqliteArtifact: string,
  ) {
    // plan() throws for cross-DBMS pairs; only 'native' is ever returned.
    this.transferPlanner.plan(sourceClient, this._driver.client);
    const exec = this.execFor(containerService);
    await this._driver.restore(exec, sqliteArtifact);
    await this._driver.postRestoreFixups(exec);
  }

  public async listTables(containerService: ContainerService) {
    return this._driver.listTables(this.execFor(containerService));
  }

  public async executeSql(sql: string, containerService: ContainerService) {
    return this._driver.executeSql(this.execFor(containerService), sql);
  }

  public escapeIdentifier(id: string): string {
    return this._driver.escapeIdentifier(id);
  }

  public escapeString(v: string): string {
    return this._driver.escapeString(v);
  }

  public disableForeignKeys(): string {
    return this._driver.disableFks();
  }

  public enableForeignKeys(): string {
    return this._driver.enableFks();
  }
}
