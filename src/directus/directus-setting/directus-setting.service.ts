import { Inject, Injectable } from '@nestjs/common';
import { ProjectSettings } from '../../config/project-settings.type.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DirectusService } from '../directus.service.js';
import { DirectusUserService } from '../directus-user/directus-user.service.js';
import { updateSettings } from '@directus/sdk';

@Injectable()
export class DirectusSettingService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly directusService: DirectusService,
    private readonly directusUserService: DirectusUserService,
  ) {}

  public async updateSettings(directusPort: number, settings: ProjectSettings) {
    const directus = this.directusService.getClient(
      directusPort,
      this.directusUserService.token,
    );

    await directus.request(updateSettings(settings));
  }
}
