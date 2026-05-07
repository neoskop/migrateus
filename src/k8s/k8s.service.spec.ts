import { describe, it, expect } from '@jest/globals';
import { K8sService } from './k8s.service.js';

describe('K8sService', () => {
  it('is exported as a class', () => {
    expect(K8sService).toBeDefined();
    expect(typeof K8sService).toBe('function');
  });
});
