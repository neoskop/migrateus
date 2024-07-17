import { Test, TestingModule } from '@nestjs/testing';
import { OnepasswordService } from './onepassword.service.js';

describe('OnepasswordService', () => {
  let service: OnepasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OnepasswordService],
    }).compile();

    service = module.get<OnepasswordService>(OnepasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
