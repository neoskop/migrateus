import { describe, it, expect } from '@jest/globals';
import { sqliteToPgCastRules } from './directus-cast-rules.js';

describe('sqliteToPgCastRules', () => {
  it('returns a string containing "to boolean"', () => {
    expect(sqliteToPgCastRules()).toContain('to boolean');
  });

  it('returns a string containing "to timestamptz"', () => {
    expect(sqliteToPgCastRules()).toContain('to timestamptz');
  });

  it('starts with CAST keyword', () => {
    expect(sqliteToPgCastRules().trimStart()).toMatch(/^CAST/);
  });
});
