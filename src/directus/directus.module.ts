import { Module } from '@nestjs/common';
import { DirectusUserService } from './directus-user/directus-user.service.js';
import { DirectusService } from './directus.service.js';
import { DirectusAssetService } from './directus-asset/directus-asset.service.js';

@Module({
  providers: [DirectusUserService, DirectusService, DirectusAssetService],
  exports: [DirectusService, DirectusUserService, DirectusAssetService],
  imports: [],
})
export class DirectusModule {}
