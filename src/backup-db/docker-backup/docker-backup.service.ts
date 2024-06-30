import { Inject, Injectable } from '@nestjs/common';
import { DockerEnvironment } from '../../config/environment.interface.js';
import shell from 'shelljs';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import chalk from 'chalk';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { BackupPerformer } from '../backup-performer.js';
import { SqlService } from '../../sql/sql.service.js';
import { DockerContainerService } from '../../container/docker-container/docker-container.service.js';
import { DockerService } from '../../docker/docker.service.js';
import { ConfigService } from '../../config/config.service.js';

@Injectable()
export class DockerBackupService extends BackupPerformer {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    private readonly dockerContainerService: DockerContainerService,
    private readonly dockerService: DockerService,
    config: ConfigService,
  ) {
    super(
      logger,
      directusAssetService,
      sqlService,
      dockerContainerService,
      config,
    );
  }

  protected async setup(backupDir: string) {
    this.dockerService.setup();
    await this.ensureDatabaseContainerIsRunning();
    await this.ensureDirectusContainerIsRunning();
    this.dockerContainerService.mount = backupDir;
  }

  protected async getDirectusPort(): Promise<number> {
    return 8055;
  }

  private async ensureDatabaseContainerIsRunning() {
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
            this.dockerService.networks.includes(network),
          ),
        )
        .filter(({ State }: { State: string }) => State !== 'running')
        .filter(({ Names }: { Names: string }) =>
          Names.split(',').some((Name: string) =>
            Name.includes(this.dockerService.databaseConfig.host),
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

  private async ensureDirectusContainerIsRunning() {
    if (this.dockerService.containerConfig.State.Running) {
      return;
    }

    this.logger.debug(
      `Starting Directus container ${chalk.bold(this.dockerService.containerConfig.Id)} since it is not running`,
    );
    shell.exec(`docker start ${this.dockerService.containerConfig.Id}`, {
      silent: true,
    });
    return new Promise((resolve) => setTimeout(resolve, 10000));
  }
}
