import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { SqlService } from '../../sql/sql.service.js';
import { AcaContainerService } from '../../container/aca-container/aca-container.service.js';
import { AcaService } from '../../aca/aca.service.js';
import { RestorePerformer } from '../restore-performer.js';
import { EnvironmentService } from '../../environment/environment.service.js';
import { ProgressService } from '../../progress/progress.service.js';
import { DirectusSettingService } from '../../directus/directus-setting/directus-setting.service.js';
import { DirectusVersionService } from '../../directus/directus-version/directus-version.service.js';
import { ConfigService } from '../../config/config.service.js';
import { PlatformResolver } from '../../platform/platform-resolver.service.js';
import { Platform } from '../../platform/platform.js';

@Injectable()
export class AcaRestoreService extends RestorePerformer {
  private backupDir: string;
  // ACA has no port-forward; reach Directus through the platform's local
  // HTTP→ingress proxy (same path the logical performers use). ponytail: the
  // resolved platform spins its own (unused) container service — harmless; the
  // performer keeps its own injected one for exec/infil.
  private platform: Platform;

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    directusSettingService: DirectusSettingService,
    private readonly acaContainerService: AcaContainerService,
    private readonly acaService: AcaService,
    environmentService: EnvironmentService,
    progressService: ProgressService,
    directusVersionService: DirectusVersionService,
    configService: ConfigService,
    private readonly platformResolver: PlatformResolver,
  ) {
    super(
      logger,
      directusAssetService,
      directusSettingService,
      sqlService,
      acaContainerService,
      environmentService,
      progressService,
      directusVersionService,
      configService,
    );
  }

  protected async setup(backupDir: string): Promise<void> {
    this.backupDir = backupDir;
    this.platform = this.platformResolver.resolve('aca');
    await this.acaService.setup();
  }

  protected async beforeMysqlDumpRestore(): Promise<void> {
    await this.acaContainerService.infilFile(
      `${this.backupDir}/backup.sql`,
      '/tmp/backup.sql',
    );
  }

  protected getDirectusPort(): Promise<number> {
    return this.platform.forwardDirectus();
  }

  protected cleanUp(): Promise<void> {
    return this.platform.teardown();
  }

  protected async restartDirectus(): Promise<void> {
    await this.acaService.restartDirectus();
  }

  protected async copyDatabaseIn(_backupDir: string): Promise<void> {
    throw new Error(
      'SQLite is only supported on docker/docker-compose platforms — use a server engine (PostgreSQL) on k8s/ACA',
    );
  }
}
