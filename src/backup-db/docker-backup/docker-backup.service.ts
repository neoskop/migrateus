import { Inject, Injectable } from '@nestjs/common';
import { DockerEnvironment } from '../../config/environment.interface.js';
import shell from 'shelljs';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import chalk from 'chalk';
import { DirectusUserService } from '../../directus/directus-user/directus-user.service.js';
import { nanoid } from 'nanoid';
import { DirectusService } from '../../directus/directus.service.js';
import { aggregate, readFiles } from '@directus/sdk';
import { Readable } from 'node:stream';
import { ReadableStream } from 'stream/web';
import fs from 'node:fs';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import pLimit from 'p-limit';
import cliProgress from 'cli-progress';
import { highlight } from 'sql-highlight';

type ContainerConfig = {
  NetworkSettings: { Networks: string[] };
  Config: { Env: string[] };
  State: { Running: boolean };
  Id: string;
};

@Injectable()
export class DockerBackupService {
  private migrateusContainerId: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly directusUserService: DirectusUserService,
    private readonly directusService: DirectusService,
  ) {}

  public async backup(environment: DockerEnvironment, backupFile: string) {
    const backupDir = this.createTemporaryDirectory();
    const containerConfig = this.getContainerConfig(environment);
    await this.ensureDatabaseContainerIsRunning(containerConfig);
    const databaseConfig = this.getDatabaseConfig(containerConfig);

    try {
      this.startMigrateusContainer(containerConfig, backupDir);
      this.mysqlDump(databaseConfig);
      await this.ensureDirectusContainerIsRunning(containerConfig);
      await this.setupDirectusUser(databaseConfig);
      await this.backupAssets(backupDir);
      this.createBackupArchive(backupDir, backupFile);
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.logger.debug(`Cleaning up`);
      await this.cleanUpDirectusUser(databaseConfig);
      this.cleanUpMigrateusContainer();
      shell.rm('-rf', backupDir);
    }
  }

  private async backupAssets(backupDir: string) {
    const assets = await this.getAllAssets();
    this.logger.debug(`Found ${chalk.bold(assets.length)} assets to backup`);
    const limit = pLimit(10);

    const progressBar = new cliProgress.SingleBar({
      etaBuffer: 50,
      format:
        'Downloading assets |' +
        chalk.cyan('{bar}') +
        '| {percentage}% || {value}/{total}',
      hideCursor: true,
    });

    progressBar.start(assets.length, 0);
    const failedDownloads = [];

    await Promise.all(
      assets.map((asset) =>
        limit(async () => {
          try {
            await this.downloadAsset(
              backupDir,
              asset.id,
              this.directusUserService.token,
            );
          } catch (error) {
            failedDownloads.push(asset.id);
          }
          progressBar.increment();
        }),
      ),
    );

    progressBar.stop();

    if (failedDownloads.length > 0) {
      this.logger.warn(
        `Failed to download ${chalk.bold(failedDownloads.length)} assets`,
      );

      for (const id of failedDownloads) {
        this.logger.debug(`Failed to download asset ${chalk.bold(id)}`);
      }
    }
  }

  private async getAllAssets() {
    const directus = this.directusService.getClient(
      8055,
      this.directusUserService.token,
    );

    const assetCount = Number(
      (
        await directus.request(
          aggregate('directus_files', {
            aggregate: { count: '*' },
          }),
        )
      )[0].count,
    );

    let assets = await directus.request(
      readFiles({ fields: ['id'], limit: 100 }),
    );

    while (assets.length < assetCount) {
      const nextAssets = await directus.request(
        readFiles({
          fields: ['id'],
          offset: assets.length,
          limit: 100,
        }),
      );
      assets = [...assets, ...nextAssets];
    }

    return assets;
  }

  private async downloadAsset(
    backupDir: string,
    fileId: string,
    directusToken: string,
  ) {
    const res = await fetch(`http://localhost:8055/assets/${fileId}`, {
      headers: {
        Authorization: `Bearer ${directusToken}`,
      },
    });

    if (res.ok) {
      const path = join(backupDir, fileId);
      const fileStream = fs.createWriteStream(path, {
        flags: 'wx',
      });
      await finished(
        Readable.fromWeb(res.body as ReadableStream<any>).pipe(fileStream),
      );
    } else {
      throw new Error(res.statusText);
    }
  }

  private async cleanUpDirectusUser(databaseConfig: {
    host: string;
    port: string;
    name: string;
    user: string;
    password: string;
  }) {
    await this.directusUserService.removeUser((sql) =>
      this.exceuteSql.bind(this)(sql, databaseConfig),
    );
  }

  private cleanUpMigrateusContainer() {
    shell.exec(`docker stop ${this.migrateusContainerId}`, { silent: true });
    shell.exec(`docker rm ${this.migrateusContainerId}`, { silent: true });
  }

  private mysqlDump(databaseConfig: {
    host: string;
    port: string;
    name: string;
    user: string;
    password: string;
  }) {
    const command = this.getBackupCommand(databaseConfig);
    const output = this.eecuteInMigrateusContainer(command);
    this.handleBackupOutput(output);
  }

  private async startMigrateusContainer(
    containerConfig: ContainerConfig,
    backupDir: string,
  ) {
    const command = [
      'docker container create',
      `--name migrateus-${nanoid(6)}`,
      '-v',
      `${backupDir}:/backup`,
    ];

    for (const networkName of Object.keys(
      containerConfig.NetworkSettings.Networks,
    )) {
      command.push('--network', networkName);
    }

    command.push('mysql');
    command.push('/bin/bash -c "while true ; do sleep 1 ; done"');

    this.migrateusContainerId = shell
      .exec(command.join(' '), {
        silent: true,
      })
      .stdout.trim();

    shell.exec(`docker start ${this.migrateusContainerId}`, { silent: true });
  }

  private exceuteSql(sql: string, databaseConfig: any) {
    const command = [
      'mysql',
      `-h${databaseConfig.host}`,
      `-P${databaseConfig.port}`,
      `-u${databaseConfig.user}`,
      `-p${databaseConfig.password}`,
      databaseConfig.name,
      '-e',
      `\\"${sql}\\"`,
    ];
    this.logger.debug(`Executing SQL: ${highlight(sql)}`);
    const output = this.eecuteInMigrateusContainer(command.join(' '));

    if (output.code !== 0) {
      throw new Error(output.stderr);
    }
  }

  private async setupDirectusUser(databaseConfig: any) {
    await this.directusUserService.setupUser((sql) =>
      this.exceuteSql.bind(this)(sql, databaseConfig),
    );
  }

  private async ensureDatabaseContainerIsRunning(
    containerConfig: ContainerConfig,
  ) {
    const networkNames = Object.keys(containerConfig.NetworkSettings.Networks);
    const containersOutput = shell.exec('docker ps -a --format json', {
      silent: true,
    }).stdout;
    const containers = containersOutput
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return Promise.all(
      containers
        .filter(({ Networks }: { Networks: string }) =>
          Networks.split(',').some((network: string) =>
            networkNames.includes(network),
          ),
        )
        .filter(({ State }: { State: string }) => State !== 'running')
        .filter(({ Names }: { Names: string }) =>
          Names.split(',').some((Name: string) =>
            Name.includes(this.getDockerEnvValue(containerConfig, 'DB_HOST')),
          ),
        )
        .map(({ ID }: { ID: string }) => {
          this.logger.debug(
            `Starting database container ${chalk.bold(ID)} since it is not running`,
          );
          shell.exec(`docker start ${ID}`, { silent: true });
          return new Promise((resolve) => setTimeout(resolve, 10000));
        }),
    );
  }

  private async ensureDirectusContainerIsRunning(
    containerConfig: ContainerConfig,
  ) {
    if (containerConfig.State.Running) {
      return;
    }

    this.logger.debug(
      `Starting Directus container ${chalk.bold(containerConfig.Id)} since it is not running`,
    );
    shell.exec(`docker start ${containerConfig.Id}`, { silent: true });
    return new Promise((resolve) => setTimeout(resolve, 10000));
  }

  private getContainerConfig(environment: DockerEnvironment) {
    const inspectOutput = shell.exec(
      `docker inspect ${environment.containerName}`,
      { silent: true },
    );
    return JSON.parse(inspectOutput.stdout)[0] as ContainerConfig;
  }

  private getDatabaseConfig(containerConfig: ContainerConfig) {
    return {
      host: this.getDockerEnvValue(containerConfig, 'DB_HOST'),
      port: this.getDockerEnvValue(containerConfig, 'DB_PORT'),
      name: this.getDockerEnvValue(containerConfig, 'DB_DATABASE'),
      user: this.getDockerEnvValue(containerConfig, 'DB_USER'),
      password: this.getDockerEnvValue(containerConfig, 'DB_PASSWORD'),
    };
  }

  private createTemporaryDirectory() {
    return shell.exec('mktemp -d', { silent: true }).stdout.trim();
  }

  private getBackupCommand(databaseConfig: any) {
    return [
      'mysqldump',
      '--no-tablespaces',
      `-h${databaseConfig.host}`,
      `-P${databaseConfig.port}`,
      `-u${databaseConfig.user}`,
      `-p${databaseConfig.password}`,
      databaseConfig.name,
      '>/backup/backup.sql',
    ].join(' ');
  }

  private eecuteInMigrateusContainer(command: string) {
    const fullCommand = `docker exec ${this.migrateusContainerId} /bin/bash -c "${command}"`;
    return shell.exec(fullCommand, { silent: true });
  }

  private handleBackupOutput(output: shell.ShellString) {
    if (output.code !== 0) {
      throw new Error(`Backup failed: ${output.stderr}`);
    }
  }

  private createBackupArchive(backupDir: string, backupFile: string) {
    shell.exec(`tar -czf ${backupFile} ${backupDir}/*`, {
      silent: true,
    });
  }

  private getDockerEnvValue(containerConfig: ContainerConfig, name: string) {
    const variable = containerConfig.Config.Env.find((env: string) =>
      env.startsWith(name),
    );

    if (!variable) {
      throw new Error(`Environment variable ${name} not found`);
    }

    return variable.split('=')[1];
  }
}
