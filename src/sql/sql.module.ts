import { Module } from '@nestjs/common';
import { SqlService } from './sql.service.js';
import { DirectusModule } from '../directus/directus.module.js';
import { TransferModule } from '../transfer/transfer.module.js';

@Module({
  providers: [SqlService],
  exports: [SqlService],
  imports: [DirectusModule, TransferModule],
})
export class SqlModule {}
