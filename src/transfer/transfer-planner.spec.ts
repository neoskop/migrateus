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

  // sqlite3→pg: pgloader
  it('returns pgloader for sqlite3→pg', () => {
    expect(planner.plan('sqlite3', 'pg')).toEqual({ mode: 'pgloader' });
  });

  // mysql→pg: not yet supported (special error)
  it('throws a not-yet-supported error for mysql→pg', () => {
    expect(() => planner.plan('mysql', 'pg')).toThrow(
      'MySQL→Postgres transfer is not yet supported',
    );
  });

  // Cross-engine targeting non-pg: unsupported
  it('throws unsupported for pg→mysql', () => {
    expect(() => planner.plan('pg', 'mysql')).toThrow(
      'Cross-engine transfer pg→mysql is unsupported',
    );
  });

  it('throws unsupported for sqlite3→mysql', () => {
    expect(() => planner.plan('sqlite3', 'mysql')).toThrow(
      'Cross-engine transfer sqlite3→mysql is unsupported',
    );
  });

  it('throws unsupported for pg→sqlite3', () => {
    expect(() => planner.plan('pg', 'sqlite3')).toThrow(
      'Cross-engine transfer pg→sqlite3 is unsupported',
    );
  });

  it('throws unsupported for mysql→sqlite3', () => {
    expect(() => planner.plan('mysql', 'sqlite3')).toThrow(
      'Cross-engine transfer mysql→sqlite3 is unsupported',
    );
  });
});
