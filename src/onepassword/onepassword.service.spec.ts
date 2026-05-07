import { describe, it, expect } from '@jest/globals';
import { OnepasswordService } from './onepassword.service.js';

describe('OnepasswordService', () => {
  it('is exported as a class', () => {
    expect(OnepasswordService).toBeDefined();
    expect(typeof OnepasswordService).toBe('function');
  });
});
