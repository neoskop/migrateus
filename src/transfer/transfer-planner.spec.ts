import { describe, it, expect } from '@jest/globals';
import { TransferPlanner } from './transfer-planner.js';

describe('TransferPlanner.plan', () => {
  const planner = new TransferPlanner();

  // Same-engine: native
  it('returns native for mysql→mysql', () => {
    expect(planner.plan('mysql', 'mysql')).toEqual({ mode: 'native' });
  });

  it('returns native for pg→pg', () => {
    expect(planner.plan('pg', 'pg')).toEqual({ mode: 'native' });
  });

  it('returns native for sqlite3→sqlite3', () => {
    expect(planner.plan('sqlite3', 'sqlite3')).toEqual({ mode: 'native' });
  });

  // Every cross-engine pair: throw pointing at logical backup
  it('throws needs-logical-backup for sqlite3→pg', () => {
    expect(() => planner.plan('sqlite3', 'pg')).toThrow(
      /needs a logical backup/,
    );
  });

  it('throws needs-logical-backup for mysql→pg', () => {
    expect(() => planner.plan('mysql', 'pg')).toThrow(
      /needs a logical backup/,
    );
  });

  it('throws needs-logical-backup for pg→mysql', () => {
    expect(() => planner.plan('pg', 'mysql')).toThrow(
      /needs a logical backup/,
    );
  });

  it('throws needs-logical-backup for sqlite3→mysql', () => {
    expect(() => planner.plan('sqlite3', 'mysql')).toThrow(
      /needs a logical backup/,
    );
  });

  it('throws needs-logical-backup for pg→sqlite3', () => {
    expect(() => planner.plan('pg', 'sqlite3')).toThrow(
      /needs a logical backup/,
    );
  });

  it('throws needs-logical-backup for mysql→sqlite3', () => {
    expect(() => planner.plan('mysql', 'sqlite3')).toThrow(
      /needs a logical backup/,
    );
  });
});
