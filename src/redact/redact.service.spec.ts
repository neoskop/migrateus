import { describe, it, expect } from '@jest/globals';
import { RedactService } from './redact.service.js';

describe('RedactService', () => {
  it('is exported as a class', () => {
    expect(RedactService).toBeDefined();
    expect(typeof RedactService).toBe('function');
  });
});
