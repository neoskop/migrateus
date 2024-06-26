import { Inject, Injectable } from '@nestjs/common';
import { K8sEnvironment } from '../../config/environment.interface.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { DirectusUserService } from '../../directus/directus-user/directus-user.service.js';
import { BackupPerformer } from '../backup-performer.js';
import { ExecOutputReturnValue } from 'shelljs';
import { DatabaseConfig } from '../database-config.interface.js';

@Injectable()
export class K8sBackupService extends BackupPerformer<K8sEnvironment> {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    directusUserService: DirectusUserService,
    directusAssetService: DirectusAssetService,
  ) {
    super(logger, directusUserService, directusAssetService);
  }

  protected setup(
    environment: K8sEnvironment,
    backupDir: string,
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }

  protected cleanUp(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  protected executeInMigrateusContainer(
    command: string,
  ): ExecOutputReturnValue {
    throw new Error('Method not implemented.');
  }

  protected getDatabaseConfig(): DatabaseConfig {
    throw new Error('Method not implemented.');
  }
}
