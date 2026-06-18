import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
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

@Injectable()
export class AcaRestoreService extends RestorePerformer {
  private backupDir: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    sqlService: SqlService,
    directusAssetService: DirectusAssetService,
    directusSettingService: DirectusSettingService,
    private readonly acaContainerService: AcaContainerService,
    private readonly acaService: AcaService,
    environmentService: EnvironmentService,
    progressService: ProgressService,
    directusVersionService: DirectusVersionService,
    configService: ConfigService,
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
    await this.acaService.setup();
  }

  protected async beforeMysqlDumpRestore(): Promise<void> {
    await this.acaContainerService.infilFile(
      `${this.backupDir}/backup.sql`,
      '/tmp/backup.sql',
    );
  }

  protected getDirectusPort(): Promise<number> {
    // TODO(verify): ACA Directus HTTP reachability is UNVERIFIED — assumes Directus reachable on 8055 from the tooling context.
    return Promise.resolve(8055);
  }

  protected async restartDirectus(): Promise<void> {
    await this.acaService.restartDirectus();
  }
}
