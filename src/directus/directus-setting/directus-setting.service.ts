import { LoggerService } from '../../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ProjectSettings } from '../../config/project-settings.type.js';
import { DirectusService } from '../directus.service.js';
import { DirectusUserService } from '../directus-user/directus-user.service.js';
import { updateSettings } from '@directus/sdk';
import { highlight } from 'cli-highlight';

@Injectable()
export class DirectusSettingService {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) private readonly logger: LoggerService,
    private readonly directusService: DirectusService,
    private readonly directusUserService: DirectusUserService,
  ) {}

  public async updateSettings(directusPort: number, settings: ProjectSettings) {
    const directus = this.directusService.getClient(
      directusPort,
      this.directusUserService.token,
    );

    this.logger.debug(
      `Updating settings: ${highlight(JSON.stringify(settings), { language: 'json' })}`,
    );
    await directus.request(updateSettings(settings));
  }
}
