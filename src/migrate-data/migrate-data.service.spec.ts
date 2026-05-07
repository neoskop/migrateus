import { describe, it, expect } from '@jest/globals';
import { MigrateDataService } from './migrate-data.service.js';

describe('MigrateDataService', () => {
  it('is exported as a class', () => {
    expect(MigrateDataService).toBeDefined();
    expect(typeof MigrateDataService).toBe('function');
  });
});
