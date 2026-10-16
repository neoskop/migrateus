import { describe, it, expect } from '@jest/globals';
import {
  fakeValue,
  pseudonymizeDatabase,
  pseudonymizeRows,
  validateRules,
  PseudonymizeRules,
} from './pseudonymize.js';

const rules: PseudonymizeRules = {
  directus_users: {
    email: 'internet.exampleEmail',
    first_name: 'person.firstName',
  },
  customers: { _pk: 'customer_id', name: 'person.fullName', iban: null },
};

describe('validateRules', () => {
  it('accepts faker paths and null', () => {
    expect(validateRules(rules)).toEqual([]);
  });

  it('rejects unknown faker paths', () => {
    expect(() => validateRules({ a: { b: 'person.nope' } })).toThrow(
      /Unknown pseudonymization kind 'person.nope'/,
    );
    expect(() => validateRules({ a: { b: 'person' } })).toThrow();
  });

  it('warns about internet.email', () => {
    expect(validateRules({ a: { b: 'internet.email' } })).toHaveLength(1);
  });
});

describe('fakeValue', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(fakeValue('person.fullName', 's1')).toBe(
      fakeValue('person.fullName', 's1'),
    );
    expect(fakeValue('person.fullName', 's1')).not.toBe(
      fakeValue('person.fullName', 's2'),
    );
  });

  it('suffixes emails with a seed hash', () => {
    expect(fakeValue('internet.exampleEmail', 's1')).toMatch(
      /\.[0-9a-f]{6}@example\.(com|net|org)$/,
    );
  });

  it('returns null for null rules', () => {
    expect(fakeValue(null, 's1')).toBeNull();
  });
});

describe('pseudonymizeRows', () => {
  const users = [
    { id: 1, email: 'alice@real.de', first_name: 'Alice' },
    { id: 2, email: 'admin@real.de', first_name: 'Admin' },
    { id: 3, email: 'migrateus-123@example.com', first_name: 'M' },
    { id: 4, email: 'bob@real.de', first_name: null },
  ];
  const keep = new Set(['admin@real.de']);

  it('replaces configured fields, keeps exempt users and empty values', () => {
    const out = pseudonymizeRows('directus_users', users, rules, 'salt', keep);
    expect(out[0].email).not.toBe('alice@real.de');
    expect(out[0].first_name).not.toBe('Alice');
    expect(out[0].id).toBe(1);
    expect(out[1]).toBe(users[1]);
    expect(out[2]).toBe(users[2]);
    expect(out[3].first_name).toBeNull();
    expect(users[0].email).toBe('alice@real.de');
  });

  it('maps equal originals to equal pseudonyms within a salt only', () => {
    const a = pseudonymizeRows('directus_users', users, rules, 'salt', keep);
    const b = pseudonymizeRows('directus_users', users, rules, 'salt', keep);
    const c = pseudonymizeRows('directus_users', users, rules, 'other', keep);
    expect(a[0].email).toBe(b[0].email);
    expect(a[0].email).not.toBe(c[0].email);
  });

  it('clears null rules and ignores _pk and unknown collections', () => {
    const rows = [{ customer_id: 7, name: 'Real Name', iban: 'DE00' }];
    const out = pseudonymizeRows('customers', rows, rules, 's', keep);
    expect(out[0]).toEqual({
      customer_id: 7,
      name: expect.not.stringMatching('Real Name'),
      iban: null,
    });
    expect(pseudonymizeRows('other', rows, rules, 's', keep)).toBe(rows);
  });
});

describe('pseudonymizeDatabase', () => {
  it('updates rows in one CASE statement per chunk and purges PII copies', async () => {
    const statements: string[] = [];
    const target = {
      escapeIdentifier: (id: string) => `"${id}"`,
      escapeString: (v: string) => `'${v.replaceAll("'", "''")}'`,
      executeSql: async (sql: string) => {
        statements.push(sql);
        if (sql.startsWith('SELECT "customer_id"')) return '7\n8\n';
        if (sql.startsWith('SELECT "id"')) return 'u1\n';
        return '';
      },
    };

    await pseudonymizeDatabase(target, rules, 'salt', new Set(['a@b.de']));

    expect(statements[0]).toBe(
      `SELECT "id" FROM "directus_users" WHERE email IS NULL OR (email NOT LIKE 'migrateus%' AND email NOT IN ('a@b.de'))`,
    );
    expect(statements[1]).toMatch(
      /^UPDATE "directus_users" SET "email" = CASE WHEN "email" IS NULL THEN NULL ELSE CASE "id" WHEN 'u1' THEN '.+' END END, "first_name" = .+ WHERE "id" IN \('u1'\)$/,
    );
    expect(statements[2]).toBe('SELECT "customer_id" FROM "customers"');
    expect(statements[3]).toMatch(/WHEN '7' THEN '.+' WHEN '8' THEN/);
    expect(statements[3]).toContain(`, "iban" = NULL WHERE`);
    expect(statements.slice(4)).toEqual([
      'DELETE FROM "directus_revisions"',
      'DELETE FROM "directus_activity"',
      'DELETE FROM "directus_sessions"',
    ]);
  });

  it('splits big tables into statements short enough for one exec argument', async () => {
    const statements: string[] = [];
    const pks = Array.from({ length: 5000 }, (_, i) => `${i}`);
    const target = {
      escapeIdentifier: (id: string) => `"${id}"`,
      escapeString: (v: string) => `'${v.replaceAll("'", "''")}'`,
      executeSql: async (sql: string) => {
        statements.push(sql);
        return sql.startsWith('SELECT') ? pks.join('\n') : '';
      },
    };

    await pseudonymizeDatabase(
      target,
      { t: { a: 'lorem.paragraph', b: 'person.fullName' } },
      'salt',
      new Set(),
    );

    const updates = statements.filter((sql) => sql.startsWith('UPDATE'));
    expect(updates.length).toBeGreaterThan(1);
    expect(Math.max(...updates.map((sql) => sql.length))).toBeLessThan(
      128 * 1024,
    );
    const updated = updates.flatMap((sql) =>
      sql.match(/WHERE "id" IN \((.*)\)$/)[1].split(', '),
    );
    expect(updated).toEqual(pks.map((pk) => `'${pk}'`));
  });
});
