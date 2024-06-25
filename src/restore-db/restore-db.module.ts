import { Module } from '@nestjs/common';
import { RestoreDbCommand } from './restore-db.command.js';
import { ConfigModule } from '../config/config.module.js';
import { RestoreDbQuestions } from './restore-db.questions.js';

@Module({
  providers: [RestoreDbCommand, RestoreDbQuestions],
  imports: [ConfigModule],
})
export class RestoreDbModule {}
