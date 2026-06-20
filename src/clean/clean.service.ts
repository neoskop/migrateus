import { Injectable } from '@nestjs/common';
import { SqlService } from '../sql/sql.service.js';
import { ConfigService } from '../config/config.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { PlatformResolver } from '../platform/platform-resolver.service.js';

@Injectable()
export class CleanService {
  constructor(
    private readonly platformResolver: PlatformResolver,
    private readonly sqlService: SqlService,
    private readonly config: ConfigService,
    private readonly environmentService: EnvironmentService,
    private readonly progressService: ProgressService,
  ) {}

  public async clean(environmentName: string) {
    const environment = this.config.getEnvironment(environmentName);
    this.environmentService.environment = environment;
    const platform = this.platformResolver.resolve(environment.platform);

    try {
      this.progressService.advance(
        '🔑 Set up platform and gather database credentials',
      );
      await platform.setup();
      this.progressService.advance('🚀 Set-up Migrateus container');
      await platform.containerService.setup();
      this.progressService.advance('🛁 Clean-up all Migrateus users');
      await this.sqlService.cleanUpAllDirectusUsers(platform.containerService);
      this.progressService.advance('🗑️ Remove old Migrateus containers');
      await platform.containerService.cleanUpAll();
      await platform.teardown();
      this.progressService.finish();
    } catch (error: any) {
      this.progressService.fail(error);
    }
  }
}
