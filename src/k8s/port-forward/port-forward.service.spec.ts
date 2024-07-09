import { Test, TestingModule } from '@nestjs/testing';
import { PortForwardService } from './port-forward.service';

describe('PortForwardService', () => {
  let service: PortForwardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PortForwardService],
    }).compile();

    service = module.get<PortForwardService>(PortForwardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
