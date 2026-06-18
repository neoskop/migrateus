import { Module } from '@nestjs/common';
import { TransferPlanner } from './transfer-planner.js';
import { PgloaderService } from './pgloader.service.js';

@Module({
  providers: [TransferPlanner, PgloaderService],
  exports: [TransferPlanner, PgloaderService],
})
export class TransferModule {}
