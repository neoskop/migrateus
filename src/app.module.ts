import { Module } from '@nestjs/common';
import { SchemaDiffModule } from './schema-diff/schema-diff.module.js';
import { RestoreDbModule } from './restore-db/restore-db.module.js';
import { WinstonModule } from 'nest-winston';
import { ConfigModule } from './config/config.module.js';
import * as winston from 'winston';
import { BackupDbModule } from './backup-db/backup-db.module.js';
import { DirectusModule } from './directus/directus.module.js';
import { CleanModule } from './clean/clean.module.js';
import { SqlModule } from './sql/sql.module.js';
import { ContainerModule } from './container/container.module.js';
import { K8sModule } from './k8s/k8s.module.js';
import { DockerModule } from './docker/docker.module.js';
import { EnvironmentModule } from './environment/environment.module.js';
import { RedactModule } from './redact/redact.module.js';
import { RedactService } from './redact/redact.service.js';
import { DependenciesModule } from './dependencies/dependencies.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { highlight } from 'cli-highlight';
import { OnepasswordModule } from './onepassword/onepassword.module.js';
import { UpdateModule } from './update/update.module.js';

@Module({
  imports: [
    WinstonModule.forRootAsync({
      useFactory: (redactService: RedactService) => ({
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
              winston.format.printf(({ level, message }) => {
                if (typeof message === 'object') {
                  message = highlight(JSON.stringify(message, null, 2), {
                    language: 'json',
                  });
                } else if (typeof message === 'string') {
                  message = redactService.redact(message);
                }

                return `[${level}]: ${message}`;
              }),
            ),
          }),
        ],
      }),
      inject: [RedactService],
      imports: [RedactModule],
    }),
    SchemaDiffModule,
    BackupDbModule,
    RestoreDbModule,
    ConfigModule,
    DirectusModule,
    CleanModule,
    SqlModule,
    ContainerModule,
    K8sModule,
    DockerModule,
    EnvironmentModule,
    RedactModule,
    DependenciesModule,
    ProgressModule,
    OnepasswordModule,
    UpdateModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
