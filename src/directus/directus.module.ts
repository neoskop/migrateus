import { Module } from '@nestjs/common';
import { DirectusUserService } from './directus-user/directus-user.service.js';
import { DirectusService } from './directus.service.js';
import { DirectusAssetService } from './directus-asset/directus-asset.service.js';
import { DirectusVersionService } from './directus-version/directus-version.service.js';
import { DirectusSettingService } from './directus-setting/directus-setting.service.js';
import { EnvironmentModule } from '../environment/environment.module.js';

@Module({
  providers: [
    DirectusUserService,
    DirectusService,
    DirectusAssetService,
    DirectusSettingService,
    DirectusVersionService,
  ],
  exports: [
    DirectusService,
    DirectusUserService,
    DirectusAssetService,
    DirectusSettingService,
    DirectusVersionService,
  ],
  imports: [
    EnvironmentModule
  ],
})
export class DirectusModule { }
