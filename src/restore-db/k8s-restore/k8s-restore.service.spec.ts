import { describe, it, expect } from '@jest/globals';
import { K8sRestoreService } from './k8s-restore.service.js';

describe('K8sRestoreService', () => {
  it('is exported as a class', () => {
    expect(K8sRestoreService).toBeDefined();
    expect(typeof K8sRestoreService).toBe('function');
  });
});
