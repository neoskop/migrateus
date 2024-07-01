import { Logger } from 'winston';
import shell from 'shelljs';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ContainerService } from '../container/container.service.js';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';

export abstract class RestorePerformer {
  constructor(
    protected readonly logger: Logger,
    private readonly directusAssetService: DirectusAssetService,
    private readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
    private readonly config: ConfigService,
  ) {}

  public async restore(backupFile: string) {
    const backupDir = this.createTemporaryDirectory();

    try {
      this.extractBackupArchive(backupDir, backupFile);
      await this.setup(backupDir);
      this.containerService.setup();
      await this.beforeMysqlDumpRestore();
      this.sqlService.restoreMysqlDump(this.containerService);
      await this.sqlService.setupDirectusUser(this.containerService);
      const directusPort = await this.getDirectusPort();
      // TODO: implement restoring of assets
      // await this.directusAssetService.restoreAssets(directusPort, backupDir);
    } catch (error) {
      this.logger.error(error.message || error);
    } finally {
      await this.sqlService.cleanUpDirectusUser(this.containerService);
      await this.cleanUp();
      this.containerService.cleanUp();
      this.deleteTemporaryDirectory(backupDir);
    }
  }

  protected abstract setup(backupDir: string): Promise<void>;

  protected async beforeMysqlDumpRestore() {}

  protected abstract getDirectusPort(): Promise<number>;

  protected async cleanUp(): Promise<void> {}

  private createTemporaryDirectory() {
    const tempDir = shell
      .exec('mktemp -d --suffix=-migrateus', { silent: true })
      .stdout.trim();
    this.logger.debug(`Created temporary directory: ${chalk.bold(tempDir)}`);
    return tempDir;
  }

  private extractBackupArchive(backupDir: string, backupFile: string) {
    shell.exec(`tar -xf ${backupFile} -C ${backupDir}`, {
      silent: true,
    });
  }

  private deleteTemporaryDirectory(backupDir: string) {
    shell.rm('-rf', backupDir);
  }
}
