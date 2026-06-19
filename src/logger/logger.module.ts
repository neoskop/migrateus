import { Global, Module } from '@nestjs/common';
import { RedactModule } from '../redact/redact.module.js';
import { LOGGER_MODULE_PROVIDER } from './logger.constants.js';
import { LoggerService } from './logger.service.js';

@Global()
@Module({
  imports: [RedactModule],
  providers: [
    LoggerService,
    {
      provide: LOGGER_MODULE_PROVIDER,
      useExisting: LoggerService,
    },
  ],
  exports: [LoggerService, LOGGER_MODULE_PROVIDER],
})
export class LoggerModule {}
