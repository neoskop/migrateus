// NOTE: az command shapes are UNVERIFIED against a live Azure subscription.

import { Inject, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service.js';
import { AcaEnvironment } from '../config/environment.interface.js';
import { SqlService } from '../sql/sql.service.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { exec } from '../util/exec.js';
import { ExecOptions, ExecOutputReturnValue } from 'shelljs';
import { DatabaseConfig } from '../backup-db/database-config.interface.js';

@Injectable()
export class AcaService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly environmentService: EnvironmentService,
    private readonly sqlService: SqlService,
  ) {}

  public get acaEnv(): AcaEnvironment['aca'] {
    return (this.environmentService.environment as AcaEnvironment).aca;
  }

  public async az(args: string, opts: ExecOptions = { silent: true }): Promise<ExecOutputReturnValue> {
    const { subscription } = this.acaEnv;
    const command = `az ${args} --subscription ${subscription}`;
    return exec(command, opts);
  }

  public async setup(): Promise<void> {
    const { app, resourceGroup } = this.acaEnv;

    const result = await this.az(
      `containerapp show -n ${app} -g ${resourceGroup} --query "properties.template.containers[0].env" -o json`,
    );

    const envArray: Array<{ name: string; value?: string; secretRef?: string }> = JSON.parse(result.stdout);

    const envMap: Record<string, string> = {};
    for (const entry of envArray) {
      if (entry.secretRef !== undefined) {
        this.logger.debug(`ACA env var ${entry.name} is a secretRef and cannot be read directly; using empty string`);
        envMap[entry.name] = '';
      } else {
        envMap[entry.name] = entry.value ?? '';
      }
    }

    const config: DatabaseConfig = {
      host: envMap['DB_HOST'] ?? '',
      port: envMap['DB_PORT'] ?? '',
      name: envMap['DB_DATABASE'] ?? '',
      user: envMap['DB_USER'] ?? '',
      password: envMap['DB_PASSWORD'] ?? '',
    };

    if (envMap['DB_CLIENT'] !== undefined) {
      config.client = envMap['DB_CLIENT'] as DatabaseConfig['client'];
    }

    if (envMap['DB_FILENAME'] !== undefined) {
      config.filename = envMap['DB_FILENAME'];
    }

    this.sqlService.databaseConfig = config;
  }

  public async restartDirectus(): Promise<void> {
    const { app, resourceGroup } = this.acaEnv;
    // TODO(verify): ACA revision restart command
    await this.az(`containerapp revision restart -n ${app} -g ${resourceGroup}`);
  }
}
