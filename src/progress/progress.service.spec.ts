import { describe, it, expect } from '@jest/globals';
import { ProgressService } from './progress.service.js';

describe('ProgressService', () => {
  it('is exported as a class', () => {
    expect(ProgressService).toBeDefined();
    expect(typeof ProgressService).toBe('function');
  });
});
