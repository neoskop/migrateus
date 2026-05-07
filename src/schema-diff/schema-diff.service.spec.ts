import { describe, it, expect } from '@jest/globals';
import { SchemaDiffService } from './schema-diff.service.js';

describe('SchemaDiffService', () => {
  it('is exported as a class', () => {
    expect(SchemaDiffService).toBeDefined();
    expect(typeof SchemaDiffService).toBe('function');
  });
});
