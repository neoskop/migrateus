import { Test, TestingModule } from '@nestjs/testing';
import { MigrateDataService } from './migrate-data.service';

describe('MigrateDataService', () => {
  let service: MigrateDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MigrateDataService],
    }).compile();

    service = module.get<MigrateDataService>(MigrateDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
