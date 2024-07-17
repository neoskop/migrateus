import { Module } from '@nestjs/common';
import { OnepasswordService } from './onepassword.service.js';
import { RedactModule } from '../redact/redact.module.js';

@Module({
  providers: [OnepasswordService],
  exports: [OnepasswordService],
  imports: [RedactModule],
})
export class OnepasswordModule {}
