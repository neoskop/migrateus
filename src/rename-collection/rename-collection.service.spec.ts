import { Test, TestingModule } from '@nestjs/testing';
import { RenameCollectionService } from './rename-collection.service.js';

describe('RenameCollectionService', () => {
  let service: RenameCollectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RenameCollectionService],
    }).compile();

    service = module.get<RenameCollectionService>(RenameCollectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
