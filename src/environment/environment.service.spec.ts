import { describe, it, expect } from '@jest/globals';
import { EnvironmentService } from './environment.service.js';

describe('EnvironmentService', () => {
  it('is exported as a class', () => {
    expect(EnvironmentService).toBeDefined();
    expect(typeof EnvironmentService).toBe('function');
  });
});
