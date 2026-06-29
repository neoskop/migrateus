import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { BackupPerformer } from '../backup-performer.js';
import { SqlService } from '../../sql/sql.service.js';
import { AcaContainerService } from '../../container/aca-container/aca-container.service.js';
import { AcaService } from '../../aca/aca.service.js';
import { ConfigService } from '../../config/config.service.js';
import { ProgressService } from '../../progress/progress.service.js';
import { DirectusVersionService } from '../../directus/directus-version/directus-version.service.js';
import { PlatformResolver } from '../../platform/platform-resolver.service.js';
import { Platform } from '../../platform/platform.js';

@Injectable()
export class AcaBackupService extends BackupPerformer {
  private backupDir: string;
  // ACA has no port-forward; reach Directus through the platform's local
  // HTTP→ingress proxy (same path the logical performers use). ponytail: the
  // resolved platform spins its own (unused) container service — harmless; the
  // performer keeps its own injected one for exec/exfil.
  private platform: Platform;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    private readonly acaContainerService: AcaContainerService,
    private readonly acaService: AcaService,
    config: ConfigService,
    progressService: ProgressService,
    directusVersionService: DirectusVersionService,
    private readonly platformResolver: PlatformResolver,
  ) {
    super(
      logger,
      directusAssetService,
      sqlService,
      acaContainerService,
      config,
      progressService,
      directusVersionService,
    );
  }

  protected async setup(backupDir: string): Promise<void> {
    this.backupDir = backupDir;
    this.platform = this.platformResolver.resolve('aca');
    await this.acaService.setup();
  }

  protected async afterMysqlDump(): Promise<void> {
    await this.acaContainerService.exfilFile(
      '/tmp/backup.sql',
      `${this.backupDir}/backup.sql`,
    );
  }

  protected getDirectusPort(): Promise<number> {
    return this.platform.forwardDirectus();
  }

  protected cleanUp(): Promise<void> {
    return this.platform.teardown();
  }

  protected copyDatabaseOut(_backupDir: string): Promise<void> {
    return Promise.reject(
      new Error(
        'SQLite is only supported on docker/docker-compose platforms — use a server engine (PostgreSQL) on k8s/ACA',
      ),
    );
  }
}
