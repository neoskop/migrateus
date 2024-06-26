import { Test, TestingModule } from '@nestjs/testing';
import { K8sBackupService } from './k8s-backup.service.js';

describe('K8sBackupService', () => {
  let service: K8sBackupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [K8sBackupService],
    }).compile();

    service = module.get<K8sBackupService>(K8sBackupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
