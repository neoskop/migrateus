import { Module } from '@nestjs/common';
import { SqlService } from './sql.service.js';
import { DirectusModule } from '../directus/directus.module.js';

@Module({
  providers: [SqlService],
  exports: [SqlService],
  imports: [DirectusModule],
})
export class SqlModule {}
