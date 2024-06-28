import { Logger } from 'winston';
import shell from 'shelljs';
import { DirectusAssetService } from '../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../sql/sql.service.js';
import { ContainerService } from '../container/container.service.js';

export abstract class BackupPerformer {
  constructor(
    protected readonly logger: Logger,
    private readonly directusAssetService: DirectusAssetService,
    private readonly sqlService: SqlService,
    private readonly containerService: ContainerService,
  ) {}

  public async backup(backupFile: string) {
    const backupDir = this.createTemporaryDirectory();

    try {
      await this.setup(backupDir);
      this.containerService.setup();
      await this.sqlService.setupDirectusUser(this.containerService);
      this.sqlService.performMysqlDump(this.containerService);
      await this.afterMysqlDump();
      const directusPort = await this.getDirectusPort();
      await this.directusAssetService.backupAssets(directusPort, backupDir);
      this.createBackupArchive(backupDir, backupFile);
    } catch (error) {
      this.logger.error(error);
    } finally {
      await this.sqlService.cleanUpDirectusUser(this.containerService);
      await this.cleanUp();
      this.containerService.cleanUp();
      this.deleteTemporaryDirectory(backupDir);
    }
  }

  protected abstract setup(backupDir: string): Promise<void>;

  protected async afterMysqlDump() {}

  protected abstract getDirectusPort(): Promise<number>;

  protected async cleanUp(): Promise<void> {}

  private createTemporaryDirectory() {
    return shell
      .exec('mktemp -d --suffix=-migrateus', { silent: true })
      .stdout.trim();
  }

  private createBackupArchive(backupDir: string, backupFile: string) {
    shell.exec(`tar -czf ${backupFile} ${backupDir}/*`, {
      silent: true,
    });
  }

  private deleteTemporaryDirectory(backupDir: string) {
    shell.rm('-rf', backupDir);
  }
}
