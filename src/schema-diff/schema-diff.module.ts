import { Module } from '@nestjs/common';
import { SchemaDiffCommand } from './schema-diff.command.js';
import { ConfigModule } from '../config/config.module.js';
import { SchemaDiffQuestions } from './schema-diff.questions.js';

@Module({
  providers: [SchemaDiffCommand, SchemaDiffQuestions],
  imports: [ConfigModule],
})
export class SchemaDiffModule {}
