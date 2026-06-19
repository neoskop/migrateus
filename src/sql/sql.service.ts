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
import { PgloaderService } from '../transfer/pgloader.service.js';

@Injectable()
export class SqlService {
  private _driver: DbDriver;
  private _config: DatabaseConfig;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly directusUserService: DirectusUserService,
    private readonly redactService: RedactService,
    private readonly transferPlanner: TransferPlanner,
    private readonly pgloaderService: PgloaderService,
  ) {}

  public set databaseConfig(config: DatabaseConfig) {
    this._config = config;
    this.redactService.addRedaction(`-p${config.password}`, { prefix: '-p' });
    this.redactService.addRedaction(config.password);
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
    return (command: string) => containerService.execute(command);
  }

  public async setupDirectusUser(containerService: ContainerService) {
    await this.directusUserService.setupUser(this._driver, (sql) =>
      this._driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async cleanUpDirectusUser(containerService: ContainerService) {
    // Nothing to clean up if setup failed before the driver/config was set —
    // guard so a setup error is not masked by a driver-undefined crash here.
    if (!this._driver) {
      return;
    }
    await this.directusUserService.removeUser(this._driver, (sql) =>
      this._driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async cleanUpAllDirectusUsers(containerService: ContainerService) {
    if (!this._driver) {
      return;
    }
    await this.directusUserService.cleanUp(this._driver, (sql) =>
      this._driver.executeSql(this.execFor(containerService), sql),
    );
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
    const { mode } = this.transferPlanner.plan(
      sourceClient,
      this._driver.client,
    );
    if (mode === 'native') {
      const exec = this.execFor(containerService);
      await this._driver.restore(exec, sqliteArtifact);
      await this._driver.postRestoreFixups(exec);
    } else {
      await this.pgloaderService.run({
        containerService,
        sqliteArtifact,
        pg: {
          host: this._config.host,
          port: this._config.port,
          user: this._config.user,
          password: this._config.password,
          name: this._config.name,
        },
      });
      // pgloader exits 0 even when it loads nothing — verify the schema was
      // actually created so the failure surfaces here (with pgloader's logged
      // output) rather than as a confusing downstream "relation does not exist".
      const tables = await this._driver.listTables(
        this.execFor(containerService),
      );
      if (tables.length === 0) {
        throw new Error(
          'pgloader completed but created no tables in the target database. ' +
            'The SQLite source may be empty/unreadable, or a cast rule may have failed — ' +
            'see the pgloader output above (re-run with -v for the full report).',
        );
      }
    }
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
