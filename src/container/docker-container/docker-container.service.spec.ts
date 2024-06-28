import { Test, TestingModule } from '@nestjs/testing';
import { DockerContainerService } from './docker-container.service.js';

describe('DockerContainerService', () => {
  let service: DockerContainerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DockerContainerService],
    }).compile();

    service = module.get<DockerContainerService>(DockerContainerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
