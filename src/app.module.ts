import { Module } from '@nestjs/common';
import { SchemaDiffModule } from './schema-diff/schema-diff.module.js';
import { RestoreDbModule } from './restore-db/restore-db.module.js';
import { ConfigModule } from './config/config.module.js';
import { LoggerModule } from './logger/logger.module.js';
import { BackupDbModule } from './backup-db/backup-db.module.js';
import { DirectusModule } from './directus/directus.module.js';
import { CleanModule } from './clean/clean.module.js';
import { SqlModule } from './sql/sql.module.js';
import { ContainerModule } from './container/container.module.js';
import { K8sModule } from './k8s/k8s.module.js';
import { DockerModule } from './docker/docker.module.js';
import { AcaModule } from './aca/aca.module.js';
import { EnvironmentModule } from './environment/environment.module.js';
import { RedactModule } from './redact/redact.module.js';
import { DependenciesModule } from './dependencies/dependencies.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { OnepasswordModule } from './onepassword/onepassword.module.js';
import { UpdateModule } from './update/update.module.js';
import { MigrateDataModule } from './migrate-data/migrate-data.module.js';
import { RenameCollectionModule } from './rename-collection/rename-collection.module.js';

@Module({
  imports: [
    LoggerModule,
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
    AcaModule,
    EnvironmentModule,
    RedactModule,
    DependenciesModule,
    ProgressModule,
    OnepasswordModule,
    UpdateModule,
    MigrateDataModule,
    RenameCollectionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
