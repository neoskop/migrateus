import { describe, it, expect } from '@jest/globals';
import { ConfigService } from './config.service.js';

describe('ConfigService', () => {
  it('is exported as a class', () => {
    expect(ConfigService).toBeDefined();
    expect(typeof ConfigService).toBe('function');
  });
});
