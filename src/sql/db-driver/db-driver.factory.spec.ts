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

  it('throws on an unknown client', () => {
    expect(() => createDbDriver({ ...base, client: 'oracle' } as never, logger)).toThrow(
      /Unsupported database client: oracle/,
    );
  });
});
