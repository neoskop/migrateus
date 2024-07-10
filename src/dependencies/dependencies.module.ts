import { Module } from '@nestjs/common';
import { DependenciesService } from './dependencies.service.js';

@Module({
  providers: [DependenciesService],
  exports: [DependenciesService],
})
export class DependenciesModule {}
