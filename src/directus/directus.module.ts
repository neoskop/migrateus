import { Module } from '@nestjs/common';
import { DirectusUserService } from './directus-user/directus-user.service.js';
import { DirectusService } from './directus.service.js';

@Module({
  providers: [DirectusUserService, DirectusService],
  exports: [DirectusService, DirectusUserService],
})
export class DirectusModule {}
