import { Global, Module } from '@nestjs/common';
import { RedactService } from './redact.service.js';

@Global()
@Module({
  providers: [RedactService],
  exports: [RedactService],
})
export class RedactModule {}
