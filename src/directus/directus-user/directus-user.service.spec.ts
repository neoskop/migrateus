import { Test, TestingModule } from '@nestjs/testing';
import { DirectusUserService } from './directus-user.service';

describe('DirectusUserService', () => {
  let service: DirectusUserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DirectusUserService],
    }).compile();

    service = module.get<DirectusUserService>(DirectusUserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
