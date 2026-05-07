import { describe, it, expect } from '@jest/globals';
import { DirectusSettingService } from './directus-setting.service.js';

describe('DirectusSettingService', () => {
  it('is exported as a class', () => {
    expect(DirectusSettingService).toBeDefined();
    expect(typeof DirectusSettingService).toBe('function');
  });
});
