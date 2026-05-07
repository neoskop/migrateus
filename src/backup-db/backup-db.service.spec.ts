import { describe, it, expect } from '@jest/globals';
import { BackupDbService } from './backup-db.service.js';

describe('BackupDbService', () => {
  it('is exported as a class', () => {
    expect(BackupDbService).toBeDefined();
    expect(typeof BackupDbService).toBe('function');
  });
});
