import { Module } from '@nestjs/common';
import { UpdateService } from './update.service.js';

@Module({
  providers: [UpdateService],
  exports: [UpdateService],
})
export class UpdateModule {}
