import { Test, TestingModule } from '@nestjs/testing';
import { CleanService } from './clean.service.js';

describe('CleanService', () => {
  let service: CleanService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CleanService],
    }).compile();

    service = module.get<CleanService>(CleanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
