import { describe, it, expect } from '@jest/globals';
import { UpdateService } from './update.service.js';

describe('UpdateService', () => {
  it('is exported as a class', () => {
    expect(UpdateService).toBeDefined();
    expect(typeof UpdateService).toBe('function');
  });
});
