import { describe, it, expect } from '@jest/globals';
import { K8sContainerService } from './k8s-container.service.js';

describe('K8sContainerService', () => {
  it('is exported as a class', () => {
    expect(K8sContainerService).toBeDefined();
    expect(typeof K8sContainerService).toBe('function');
  });
});
