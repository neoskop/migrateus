import { Module } from '@nestjs/common';
import { SchemaDiffModule } from './schema-diff/schema-diff.module.js';
import { RestoreDbModule } from './restore-db/restore-db.module.js';
import { WinstonModule } from 'nest-winston';
import { ConfigModule } from './config/config.module.js';
import * as winston from 'winston';
import { BackupDbModule } from './backup-db/backup-db.module.js';
import { DirectusModule } from './directus/directus.module.js';

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format((info) => ({
              ...info,
              level: info.level.toUpperCase(),
            }))(),
            winston.format.colorize(),
            winston.format.errors({ stack: true }),
            winston.format.splat(),
            winston.format.printf(
              ({ level, message }) => `[${level}]: ${message}`,
            ),
          ),
        }),
      ],
    }),
    SchemaDiffModule,
    BackupDbModule,
    RestoreDbModule,
    ConfigModule,
    DirectusModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
