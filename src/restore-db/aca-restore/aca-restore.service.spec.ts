import { describe, it, expect } from '@jest/globals';
import { AcaRestoreService } from './aca-restore.service.js';

describe('AcaRestoreService', () => {
  it('is exported as a class', () => {
    expect(AcaRestoreService).toBeDefined();
    expect(typeof AcaRestoreService).toBe('function');
  });
});
