import { Test, TestingModule } from '@nestjs/testing';
import { SchemaDiffService } from './schema-diff.service.js';

describe('SchemaDiffService', () => {
  let service: SchemaDiffService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaDiffService],
    }).compile();

    service = module.get<SchemaDiffService>(SchemaDiffService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
