import { Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { OnepasswordModule } from '../onepassword/onepassword.module.js';

@Module({
  providers: [ConfigService],
  exports: [ConfigService],
  imports: [OnepasswordModule],
})
export class ConfigModule {}
