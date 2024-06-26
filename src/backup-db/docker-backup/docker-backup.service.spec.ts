import { Test, TestingModule } from '@nestjs/testing';
import { DockerBackupService } from './docker-backup.service.js';

describe('DockerBackupService', () => {
  let service: DockerBackupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DockerBackupService],
    }).compile();

    service = module.get<DockerBackupService>(DockerBackupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
