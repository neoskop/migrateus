import { Module } from '@nestjs/common';
import { BackupDbCommand } from './backup-db.command.js';
import { ConfigModule } from '../config/config.module.js';
import { BackupDbQuestions } from './backup-db.questions.js';
import { BackupDbService } from './backup-db.service.js';

@Module({
  providers: [BackupDbCommand, BackupDbQuestions, BackupDbService],
  imports: [ConfigModule],
})
export class BackupDbModule {}
