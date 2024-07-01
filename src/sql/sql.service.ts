import { Inject, Injectable } from '@nestjs/common';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';
import { highlight } from 'cli-highlight';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DatabaseConfig } from '../backup-db/database-config.interface.js';
import { ContainerService } from '../container/container.service.js';

@Injectable()
export class SqlService {
  public databaseConfig: DatabaseConfig;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly directusUserService: DirectusUserService,
  ) {}

  public async setupDirectusUser(containerService: ContainerService) {
    await this.directusUserService.setupUser((sql) =>
      this.exceuteSql.bind(this)(sql, containerService),
    );
  }

  public async cleanUpDirectusUser(containerService: ContainerService) {
    await this.directusUserService.removeUser((sql) =>
      this.exceuteSql.bind(this)(sql, containerService),
    );
  }

  public async cleanUpAllDirectusUsers(containerService: ContainerService) {
    await this.directusUserService.cleanUp((sql) =>
      this.exceuteSql.bind(this)(sql, containerService),
    );
  }

  public async performMysqlDump(containerService: ContainerService) {
    const { host, port, user, password, name } = this.databaseConfig;
    const command = [
      'mysqldump',
      '--no-tablespaces',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      '>/tmp/backup.sql',
    ].join(' ');

    const output = containerService.execute(command);

    if (output.code !== 0) {
      throw new Error(
        `Backup failed with status code ${output.code}: ${output.stderr}`,
      );
    }
  }

  private async exceuteSql(sql: string, containerService: ContainerService) {
    const { host, port, user, password, name } = this.databaseConfig;
    const command = [
      'mysql',
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      `-p${password}`,
      name,
      '-e',
      `\\"${sql}\\"`,
    ];
    this.logger.debug(
      `Executing SQL: ${highlight(sql, { language: 'sql', ignoreIllegals: true })}`,
    );
    const output = containerService.execute(command.join(' '));

    if (output.code !== 0) {
      throw new Error(
        `Execution of SQL failed with status code ${output.code}: ${output.stderr}`,
      );
    }
  }
}
