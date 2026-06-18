import { Module } from '@nestjs/common';
import { AcaService } from './aca.service.js';
import { EnvironmentModule } from '../environment/environment.module.js';
import { SqlModule } from '../sql/sql.module.js';

@Module({
  providers: [AcaService],
  exports: [AcaService],
  imports: [EnvironmentModule, SqlModule],
})
export class AcaModule {}
