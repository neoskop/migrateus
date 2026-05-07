import { describe, it, expect } from '@jest/globals';
import { CleanService } from './clean.service.js';

describe('CleanService', () => {
  it('is exported as a class', () => {
    expect(CleanService).toBeDefined();
    expect(typeof CleanService).toBe('function');
  });
});
