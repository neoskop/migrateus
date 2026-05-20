import { Module } from '@nestjs/common';
import { ErrorFormatterService } from './error-formatter.service.js';

@Module({
  providers: [ErrorFormatterService],
  exports: [ErrorFormatterService],
})
export class ErrorFormatterModule {}
