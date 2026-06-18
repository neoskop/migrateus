import { describe, it, expect, jest } from '@jest/globals';
import { createDbDriver } from './db-driver.factory.js';

const logger = { debug: jest.fn() } as never;
const base = { host: 'h', port: '3306', user: 'u', password: 'p', name: 'd' };

describe('createDbDriver', () => {
  it('defaults to mysql when client is absent', () => {
    expect(createDbDriver(base as never, logger).client).toBe('mysql');
  });

  it('returns a mysql driver for client=mysql', () => {
    expect(createDbDriver({ ...base, client: 'mysql' } as never, logger).client).toBe('mysql');
  });

  it('returns a pg driver for client=pg', () => {
    expect(createDbDriver({ ...base, client: 'pg' } as never, logger).client).toBe('pg');
  });

  it('returns a sqlite3 driver for client=sqlite3', () => {
    expect(createDbDriver({ ...base, client: 'sqlite3' } as never, logger).client).toBe('sqlite3');
  });

  it('throws on an unknown client', () => {
    expect(() => createDbDriver({ ...base, client: 'oracle' } as never, logger)).toThrow(
      /Unsupported database client: oracle/,
    );
  });
});
