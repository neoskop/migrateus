import { describe, it, expect } from '@jest/globals';
import { DirectusService } from './directus.service.js';

describe('DirectusService', () => {
  it('is exported as a class', () => {
    expect(DirectusService).toBeDefined();
    expect(typeof DirectusService).toBe('function');
  });
});
