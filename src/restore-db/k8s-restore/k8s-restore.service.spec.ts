import { Test, TestingModule } from '@nestjs/testing';
import { K8sRestoreService } from './k8s-restore.service';

describe('K8sRestoreService', () => {
  let service: K8sRestoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [K8sRestoreService],
    }).compile();

    service = module.get<K8sRestoreService>(K8sRestoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
