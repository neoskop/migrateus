import { describe, it, expect } from '@jest/globals';
import { DirectusAssetService } from './directus-asset.service.js';

describe('DirectusAssetService', () => {
  it('is exported as a class', () => {
    expect(DirectusAssetService).toBeDefined();
    expect(typeof DirectusAssetService).toBe('function');
  });
});
