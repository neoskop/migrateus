import { Test, TestingModule } from '@nestjs/testing';
import { DirectusAssetService } from './directus-asset.service';

describe('DirectusAssetService', () => {
  let service: DirectusAssetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DirectusAssetService],
    }).compile();

    service = module.get<DirectusAssetService>(DirectusAssetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
