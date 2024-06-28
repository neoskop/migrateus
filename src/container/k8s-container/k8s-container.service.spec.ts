import { Test, TestingModule } from '@nestjs/testing';
import { K8sContainerService } from './k8s-container.service.js';

describe('K8sContainerService', () => {
  let service: K8sContainerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [K8sContainerService],
    }).compile();

    service = module.get<K8sContainerService>(K8sContainerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
