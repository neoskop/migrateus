import { Logger } from 'winston';
import shell from 'shelljs';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ContainerService } from '../container/container.service.js';
import { join } from 'node:path';
import chalk from 'chalk';
import { ConfigService } from '../config/config.service.js';
import tmp from 'tmp';

export abstract class BackupPerformer {
  constructor(
    protected readonly logger: Logger,
    private readonly directusAssetService: DirectusAssetService,
    private readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
    private readonly config: ConfigService,
  ) {}

  public async backup(backupFile: string) {
    const backupDir = await this.createTemporaryDirectory();

    try {
      await this.setup(backupDir);
      this.containerService.setup();
      this.sqlService.performMysqlDump(this.containerService);
      await this.afterMysqlDump();

      if (this.config.noAssets) {
        this.logger.debug('Skipping backup of assets');
      } else {
        await this.sqlService.setupDirectusUser(this.containerService);
        const directusPort = await this.getDirectusPort();
        await this.directusAssetService.backupAssets(directusPort, backupDir);
      }

      this.createBackupArchive(backupDir, backupFile);
    } catch (error) {
      this.logger.error(error);
    } finally {
      if (!this.config.noAssets) {
        await this.sqlService.cleanUpDirectusUser(this.containerService);
      }
      await this.cleanUp();
      this.containerService.cleanUp();
      this.deleteTemporaryDirectory(backupDir);
    }
  }

  protected abstract setup(backupDir: string): Promise<void>;

  protected async afterMysqlDump() {}

  protected abstract getDirectusPort(): Promise<number>;

  protected async cleanUp(): Promise<void> {}

  private async createTemporaryDirectory() {
    const tempDir = tmp.dirSync({ mode: 0o777, prefix: 'migrateus-' }).name;
    this.logger.debug(`Created temporary directory: ${chalk.bold(tempDir)}`);
    return tempDir;
  }

  private createBackupArchive(backupDir: string, backupFile: string) {
    const targetPath = join(shell.pwd().stdout, backupFile);
    const ouput = shell.exec(`tar -czf ${targetPath} *`, {
      silent: true,
      cwd: backupDir,
    });

    if (ouput.code !== 0) {
      throw new Error(
        `Failed to create backup archive ${chalk.bold(targetPath)}: ${chalk.red(ouput.stderr)}`,
      );
    }
  }

  private deleteTemporaryDirectory(backupDir: string) {
    shell.rm('-rf', backupDir);
  }
}
