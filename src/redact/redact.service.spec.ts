import { Test, TestingModule } from '@nestjs/testing';
import { RedactService } from './redact.service.js';

describe('RedactService', () => {
  let service: RedactService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedactService],
    }).compile();

    service = module.get<RedactService>(RedactService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
