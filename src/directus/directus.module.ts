import { Module } from '@nestjs/common';
import { DirectusUserService } from './directus-user/directus-user.service.js';
import { DirectusService } from './directus.service.js';
import { DirectusAssetService } from './directus-asset/directus-asset.service.js';
import { DirectusSettingService } from './directus-setting/directus-setting.service.js';

@Module({
  providers: [
    DirectusUserService,
    DirectusService,
    DirectusAssetService,
    DirectusSettingService,
  ],
  exports: [
    DirectusService,
    DirectusUserService,
    DirectusAssetService,
    DirectusSettingService,
  ],
  imports: [],
})
export class DirectusModule {}
