import { describe, it, expect } from '@jest/globals';
import {
  assertSafeCharsetOrCollation,
  assertSafeIdentifier,
  assertUuid,
  escapeMysqlIdentifier,
  escapeMysqlString,
} from './sql-escape.js';

describe('escapeMysqlString', () => {
  it('wraps plain ASCII in single quotes', () => {
    expect(escapeMysqlString('users')).toBe("'users'");
  });

  it("doubles single quotes (SQL-style)", () => {
    expect(escapeMysqlString("O'Brien")).toBe("'O''Brien'");
  });

  it('escapes backslash by doubling', () => {
    expect(escapeMysqlString('a\\b')).toBe("'a\\\\b'");
  });

  it('escapes double-quote with backslash', () => {
    expect(escapeMysqlString('he said "hi"')).toBe("'he said \\\"hi\\\"'");
  });

  it.each([
    ['\0', "'\\0'"],
    ['\b', "'\\b'"],
    ['\n', "'\\n'"],
    ['\r', "'\\r'"],
    ['\t', "'\\t'"],
    ['\x1a', "'\\Z'"],
  ])('escapes control char %j', (input, expected) => {
    expect(escapeMysqlString(input)).toBe(expected);
  });

  it('returns literal NULL for null', () => {
    expect(escapeMysqlString(null as unknown as string)).toBe('NULL');
  });

  it('returns literal NULL for undefined', () => {
    expect(escapeMysqlString(undefined as unknown as string)).toBe('NULL');
  });

  it('returns empty quoted string for empty input', () => {
    expect(escapeMysqlString('')).toBe("''");
  });

  it('neutralises classic injection payload', () => {
    const out = escapeMysqlString("'; DROP TABLE x;--");
    expect(out.startsWith("'")).toBe(true);
    expect(out.endsWith("'")).toBe(true);
    const inner = out.slice(1, -1);
    expect(/(^|[^'])'(?!')/.test(inner)).toBe(false);
  });
});

describe('escapeMysqlIdentifier', () => {
  it('wraps in backticks', () => {
    expect(escapeMysqlIdentifier('users')).toBe('`users`');
  });

  it('doubles backticks', () => {
    expect(escapeMysqlIdentifier('a`b')).toBe('`a``b`');
  });

  it('throws on empty string', () => {
    expect(() => escapeMysqlIdentifier('')).toThrow(
      'Identifier must be a non-empty string',
    );
  });

  it('throws on non-string input', () => {
    expect(() => escapeMysqlIdentifier(42 as unknown as string)).toThrow(
      'Identifier must be a non-empty string',
    );
  });
});

describe('assertSafeIdentifier', () => {
  it.each(['users', '_x', 'tbl_1', 'a$b', 'a'.repeat(64)])(
    'accepts %j',
    (input) => {
      expect(assertSafeIdentifier(input, 'ctx')).toBe(input);
    },
  );

  it.each(['1abc', 'a-b', 'a b', 'a;', '', 'a'.repeat(65), "a'b", 'users; DROP'])(
    'rejects %j',
    (input) => {
      expect(() => assertSafeIdentifier(input, 'oldName')).toThrow(
        /Invalid SQL identifier for oldName/,
      );
    },
  );

  it('embeds JSON-stringified value in error', () => {
    expect(() => assertSafeIdentifier('a b', 'ctx')).toThrow('"a b"');
  });
});

describe('assertUuid', () => {
  it('accepts canonical lowercase', () => {
    const u = '550e8400-e29b-41d4-a716-446655440000';
    expect(assertUuid(u, 'ctx')).toBe(u);
  });

  it('accepts uppercase', () => {
    const u = '550E8400-E29B-41D4-A716-446655440000';
    expect(assertUuid(u, 'ctx')).toBe(u);
  });

  it('accepts mixed case', () => {
    const u = '550e8400-E29B-41d4-A716-446655440000';
    expect(assertUuid(u, 'ctx')).toBe(u);
  });

  it.each([
    '550e8400-e29b-41d4-a716-44665544000',
    '550e8400e29b41d4a716446655440000',
    '550e8400-e29b-41d4-a716-446655440000 ',
    '',
    'not-a-uuid',
  ])('rejects %j', (input) => {
    expect(() => assertUuid(input, 'directus_users.id')).toThrow(
      /Invalid UUID for directus_users\.id/,
    );
  });
});

describe('assertSafeCharsetOrCollation', () => {
  it.each(['utf8mb4', 'utf8mb4_unicode_ci', 'a'.repeat(64)])(
    'accepts %j',
    (input) => {
      expect(assertSafeCharsetOrCollation(input, 'ctx')).toBe(input);
    },
  );

  it.each(['', 'a'.repeat(65), 'utf8mb4; DROP DB', "utf8mb4'", 'utf8 mb4'])(
    'rejects %j',
    (input) => {
      expect(() =>
        assertSafeCharsetOrCollation(input, 'default collation'),
      ).toThrow(/Invalid charset\/collation for default collation/);
    },
  );
});
