import { Inject, Injectable } from '@nestjs/common';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';
import { highlight } from 'cli-highlight';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
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
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
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
    return this.driver.client;
  }

  public get clientImage(): string {
    return this.driver.clientImage;
  }

  private get driver(): DbDriver {
    return this._driver;
  }

  private execFor(containerService: ContainerService): Exec {
    return (command: string) => containerService.execute(command);
  }

  public async setupDirectusUser(containerService: ContainerService) {
    await this.directusUserService.setupUser(this.driver, (sql) =>
      this.driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async cleanUpDirectusUser(containerService: ContainerService) {
    await this.directusUserService.removeUser(this.driver, (sql) =>
      this.driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async cleanUpAllDirectusUsers(containerService: ContainerService) {
    await this.directusUserService.cleanUp(this.driver, (sql) =>
      this.driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async setCredentials(credentials: Credential[], containerService: ContainerService) {
    if (!credentials || credentials.length === 0) {
      return;
    }
    await this.directusUserService.setCredentials(credentials, this.driver, (sql) =>
      this.driver.executeSql(this.execFor(containerService), sql),
    );
  }

  public async setAssetStorage(storage: string, containerService: ContainerService) {
    if (!storage) {
      return;
    }
    const escaped = this.driver.escapeString(storage);
    await this.driver.executeSql(
      this.execFor(containerService),
      `UPDATE directus_files SET storage = ${escaped} WHERE storage <> ${escaped} OR storage IS NULL;`,
    );
  }

  public async performMysqlDump(containerService: ContainerService, tableNames?: string[]) {
    await this.driver.dump(this.execFor(containerService), '/tmp/backup.sql', tableNames);
  }

  public async restoreMysqlDump(containerService: ContainerService) {
    const exec = this.execFor(containerService);
    await this.driver.restore(exec, '/tmp/backup.sql');
    await this.driver.postRestoreFixups(exec);
  }

  public async dropAllTables(containerService: ContainerService) {
    await this.driver.dropAllTables(this.execFor(containerService));
  }

  public async transferRestore(
    containerService: ContainerService,
    sourceClient: 'mysql' | 'pg' | 'sqlite3',
    sqliteArtifact: string,
  ) {
    const { mode } = this.transferPlanner.plan(sourceClient, this.driver.client);
    if (mode === 'native') {
      const exec = this.execFor(containerService);
      await this.driver.restore(exec, sqliteArtifact);
      await this.driver.postRestoreFixups(exec);
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
    }
  }

  public async listTables(containerService: ContainerService) {
    return this.driver.listTables(this.execFor(containerService));
  }

  public async executeSql(sql: string, containerService: ContainerService) {
    return this.driver.executeSql(this.execFor(containerService), sql);
  }

  public escapeIdentifier(id: string): string {
    return this.driver.escapeIdentifier(id);
  }

  public escapeString(v: string): string {
    return this.driver.escapeString(v);
  }

  public disableForeignKeys(): string {
    return this.driver.disableFks();
  }

  public enableForeignKeys(): string {
    return this.driver.enableFks();
  }
}
