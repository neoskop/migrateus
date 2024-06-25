import { Test, TestingModule } from '@nestjs/testing';
import { BackupDbService } from './backup-db.service';

describe('BackupDbService', () => {
  let service: BackupDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BackupDbService],
    }).compile();

    service = module.get<BackupDbService>(BackupDbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
