import { describe, it, expect } from '@jest/globals';
import { DependenciesService } from './dependencies.service.js';

describe('DependenciesService', () => {
  it('is exported as a class', () => {
    expect(DependenciesService).toBeDefined();
    expect(typeof DependenciesService).toBe('function');
  });
});
