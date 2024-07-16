import { Test, TestingModule } from '@nestjs/testing';
import { DirectusSettingService } from './directus-setting.service.js';

describe('DirectusSettingService', () => {
  let service: DirectusSettingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DirectusSettingService],
    }).compile();

    service = module.get<DirectusSettingService>(DirectusSettingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
