import { describe, it, expect } from '@jest/globals';
import { K8sBackupService } from './k8s-backup.service.js';

describe('K8sBackupService', () => {
  it('is exported as a class', () => {
    expect(K8sBackupService).toBeDefined();
    expect(typeof K8sBackupService).toBe('function');
  });
});
