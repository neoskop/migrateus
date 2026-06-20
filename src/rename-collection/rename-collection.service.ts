import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { EnvironmentService } from '../environment/environment.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { ContainerService } from '../container/container.service.js';
import { SqlService } from '../sql/sql.service.js';
import { PlatformResolver } from '../platform/platform-resolver.service.js';
import { Platform } from '../platform/platform.js';
import { assertSafeIdentifier } from '../sql/sql-escape.js';

@Injectable()
export class RenameCollectionService {
  private readonly platforms: { [name: string]: Platform } = {};

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly config: ConfigService,
    private readonly environmentService: EnvironmentService,
    private readonly progressService: ProgressService,
    private readonly sqlService: SqlService,
    private readonly platformResolver: PlatformResolver,
  ) {}

  public async renameCollection(
    environmentName: string,
    oldName: string,
    newName: string,
  ) {
    assertSafeIdentifier(oldName, 'oldName');
    assertSafeIdentifier(newName, 'newName');

    const containerService =
      await this.prepareContainerService(environmentName);

    try {
      const environment = this.config.getEnvironment(environmentName);
      this.environmentService.environment = environment;
      this.progressService.advance(
        `🚀 Rename collection ${chalk.bold(oldName)} to ${chalk.bold(newName)}`,
      );
      const tableExists = await this.sqlService
        .listTables(containerService)
        .then((tables) => tables.includes(oldName));

      if (tableExists) {
        const alterTableStatement = `ALTER TABLE ${this.sqlService.escapeIdentifier(oldName)} RENAME TO ${this.sqlService.escapeIdentifier(newName)};`;
        await this.sqlService.executeSql(alterTableStatement, containerService);
      }

      const oldLiteral = this.sqlService.escapeString(oldName);
      const newLiteral = this.sqlService.escapeString(newName);
      const groupCol = this.sqlService.escapeIdentifier('group');

      const otherStatements = [
        `${this.sqlService.disableForeignKeys()};`,
        `UPDATE directus_collections SET ${groupCol} = ${newLiteral} WHERE ${groupCol} = ${oldLiteral};`,
        `UPDATE directus_collections SET collection = ${newLiteral} WHERE collection = ${oldLiteral};`,
        `UPDATE directus_fields SET collection = ${newLiteral} WHERE collection = ${oldLiteral};`,
        `UPDATE directus_relations SET many_collection = ${newLiteral} WHERE many_collection = ${oldLiteral};`,
        `UPDATE directus_relations SET one_collection = ${newLiteral} WHERE one_collection = ${oldLiteral};`,
        `UPDATE directus_permissions SET collection = ${newLiteral} WHERE collection = ${oldLiteral};`,
        `${this.sqlService.enableForeignKeys()};`,
      ];

      await this.sqlService.executeSql(
        otherStatements.join('\n'),
        containerService,
      );
      this.progressService.finish();
    } catch (error: any) {
      this.progressService.fail(error);
    } finally {
      this.progressService.advance('🧹 Cleaning up');
      await containerService.cleanUp();
      this.progressService.finish();
    }
  }

  private async prepareContainerService(name: string): Promise<ContainerService> {
    if (!this.platforms[name]) {
      this.progressService.advance(
        `🚀 Set-up Migrateus container for environment ${chalk.bold(name)}`,
      );
      const env = this.config.getEnvironment(name);
      this.environmentService.environment = env;
      const platform = this.platformResolver.resolve(env.platform);
      await platform.setup();
      await platform.containerService.setup();
      this.platforms[name] = platform;
    }

    return this.platforms[name].containerService;
  }
}
