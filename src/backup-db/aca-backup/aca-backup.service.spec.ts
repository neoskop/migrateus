import { describe, it, expect } from '@jest/globals';
import { AcaBackupService } from './aca-backup.service.js';

describe('AcaBackupService', () => {
  it('is exported as a class', () => {
    expect(AcaBackupService).toBeDefined();
    expect(typeof AcaBackupService).toBe('function');
  });
});
