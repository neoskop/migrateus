import { Module } from '@nestjs/common';
import { TransferPlanner } from './transfer-planner.js';

@Module({
  providers: [TransferPlanner],
  exports: [TransferPlanner],
})
export class TransferModule {}
