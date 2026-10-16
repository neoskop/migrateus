import { createHash, randomBytes } from 'node:crypto';
import { allFakers, Faker, faker as defaultFaker } from '@faker-js/faker';

/**
 * `collection → field → faker method path` (e.g. `person.firstName`), or
 * `null` to clear the field. The reserved `_pk` key names the primary key
 * column (default `id`) for SQL-based pseudonymization of physical restores.
 */
export type PseudonymizeRules = Record<string, Record<string, string | null>>;

/** SQL access needed to pseudonymize a database in place (physical restore). */
export interface PseudonymizeSqlTarget {
  executeSql(sql: string): Promise<string>;
  escapeIdentifier(id: string): string;
  escapeString(value: string): string;
}

const PK_KEY = '_pk';
/**
 * Max length of the CASE clauses in one UPDATE. Statements travel as one
 * `bash -c` argument (e.g. via `kubectl exec`), and Linux caps a single
 * argument at 128 KiB (MAX_ARG_STRLEN), else spawn fails with E2BIG.
 */
const MAX_UPDATE_LENGTH = 64 * 1024;

/** Directus system tables that keep copies of item data or user sessions. */
const PII_COPY_TABLES = [
  'directus_revisions',
  'directus_activity',
  'directus_sessions',
];

let faker: Faker = defaultFaker;

/** Selects the faker locale (e.g. `de`, `de_AT`); `undefined` keeps English. */
export function setFakerLocale(locale: string | undefined): void {
  if (locale === undefined) {
    faker = defaultFaker;
    return;
  }
  if (!(locale in allFakers)) {
    throw new Error(
      `Unknown faker locale '${locale}' — expected one of ${Object.keys(allFakers).join(', ')}`,
    );
  }
  faker = allFakers[locale as keyof typeof allFakers];
}

export function newSalt(): string {
  return randomBytes(16).toString('hex');
}

/** Resolves a `module.method` path to the faker function, or throws. */
function fakerFunction(path: string): () => unknown {
  const [module, method, ...rest] = path.split('.');
  const fn = (faker as any)[module]?.[method];
  if (rest.length > 0 || typeof fn !== 'function') {
    throw new Error(
      `Unknown pseudonymization kind '${path}' — expected a faker method path like 'person.firstName'`,
    );
  }
  return () => fn.call((faker as any)[module]);
}

/** Throws on unknown faker paths; returns warnings for risky rules. */
export function validateRules(rules: PseudonymizeRules): string[] {
  const warnings: string[] = [];
  for (const [collection, fields] of Object.entries(rules)) {
    for (const [field, path] of Object.entries(fields ?? {})) {
      if (field === PK_KEY || path === null) continue;
      fakerFunction(path);
      if (path === 'internet.email') {
        warnings.push(
          `${collection}.${field} uses 'internet.email', which generates real-looking domains — use 'internet.exampleEmail' so mails cannot reach real people`,
        );
      }
    }
  }
  return warnings;
}

function seedFor(seed: string): number[] {
  const digest = createHash('sha256').update(seed).digest();
  return [0, 4, 8, 12].map((offset) => digest.readUInt32BE(offset));
}

/**
 * Deterministic fake value for `path`, seeded by `seed`. Emails get a short
 * hash in the local part so distinct seeds cannot collide on unique columns.
 * ponytail: only emails get the suffix; add a `unique` rule option if other
 * unique columns collide.
 */
export function fakeValue(path: string | null, seed: string): unknown {
  if (path === null) return null;
  faker.seed(seedFor(seed));
  const value = fakerFunction(path)();
  if (/email$/i.test(path) && typeof value === 'string') {
    const hash = createHash('sha256').update(seed).digest('hex').slice(0, 6);
    return value.replace('@', `.${hash}@`);
  }
  return value;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Rows that must keep their identity: configured credentials and Migrateus' own admin. */
function isKeptUser(email: unknown, keepEmails: Set<string>): boolean {
  return (
    typeof email === 'string' &&
    (keepEmails.has(email) || email.startsWith('migrateus'))
  );
}

/**
 * Replaces configured fields in `rows`. The seed is the salt, the faker path
 * and the original value, so equal originals map to equal pseudonyms within
 * one run (across collections too), while different runs are unlinkable.
 */
export function pseudonymizeRows(
  collection: string,
  rows: Record<string, unknown>[],
  rules: PseudonymizeRules,
  salt: string,
  keepEmails: Set<string>,
): Record<string, unknown>[] {
  const fields = Object.entries(rules[collection] ?? {}).filter(
    ([field]) => field !== PK_KEY,
  );
  if (fields.length === 0) return rows;

  return rows.map((row) => {
    if (collection === 'directus_users' && isKeptUser(row.email, keepEmails)) {
      return row;
    }
    const result = { ...row };
    for (const [field, path] of fields) {
      if (!(field in result) || isEmpty(result[field])) continue;
      result[field] = fakeValue(
        path,
        `${salt}:${path}:${JSON.stringify(result[field])}`,
      );
    }
    return result;
  });
}

function toSqlLiteral(value: unknown, target: PseudonymizeSqlTarget): string {
  if (value === null || value === undefined) return 'NULL';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return target.escapeString(text);
}

/**
 * Pseudonymizes a restored database in place and purges Directus tables that
 * hold copies of the original data. Only primary keys are read back (other
 * values may contain newlines, which break the line-based SQL output), so the
 * seed is per row rather than per original value.
 * Each chunk is ONE `UPDATE … SET f = CASE pk WHEN … END` statement, because
 * the SQLite driver executes only the first statement of a batch. Chunks are
 * cut by length, see MAX_UPDATE_LENGTH.
 * ponytail: many small execs are slow on big tables; copy a .sql file into
 * the container if that ever hurts.
 */
export async function pseudonymizeDatabase(
  target: PseudonymizeSqlTarget,
  rules: PseudonymizeRules,
  salt: string,
  keepEmails: Set<string>,
): Promise<void> {
  for (const [table, tableRules] of Object.entries(rules)) {
    const pk = tableRules[PK_KEY] ?? 'id';
    const fields = Object.entries(tableRules).filter(
      ([field]) => field !== PK_KEY,
    );
    if (fields.length === 0) continue;

    const t = target.escapeIdentifier(table);
    const p = target.escapeIdentifier(pk);
    let where = '';
    if (table === 'directus_users') {
      const kept = [...keepEmails].map((e) => target.escapeString(e));
      where =
        ` WHERE email IS NULL OR (email NOT LIKE 'migrateus%'` +
        (kept.length > 0 ? ` AND email NOT IN (${kept.join(', ')})` : '') +
        ')';
    }

    const pks = (await target.executeSql(`SELECT ${p} FROM ${t}${where}`))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    // null rules need no CASE: clearing a NULL keeps it NULL anyway.
    const cleared = fields
      .filter(([, path]) => path === null)
      .map(([field]) => `${target.escapeIdentifier(field)} = NULL`);
    const faked = fields.filter(([, path]) => path !== null);

    const update = (keys: string[], cases: string[][]) => {
      const assignments = faked.map(([field], i) => {
        const f = target.escapeIdentifier(field);
        // Keep NULLs NULL. No `= ''` check: it errors on non-text columns in Postgres.
        return `${f} = CASE WHEN ${f} IS NULL THEN NULL ELSE CASE ${p} ${cases[i].join(' ')} END END`;
      });
      return target.executeSql(
        `UPDATE ${t} SET ${[...assignments, ...cleared].join(', ')} WHERE ${p} IN (${keys.join(', ')})`,
      );
    };

    let keys: string[] = [];
    let cases: string[][] = faked.map(() => []);
    let length = 0;
    for (const pkValue of pks) {
      const key = target.escapeString(pkValue);
      const whens = faked.map(
        ([field, path]) =>
          `WHEN ${key} THEN ${toSqlLiteral(fakeValue(path, `${salt}:${table}:${pkValue}:${field}`), target)}`,
      );
      const rowLength = whens.reduce(
        (sum, when) => sum + when.length + 1,
        key.length + 2,
      );
      if (keys.length > 0 && length + rowLength > MAX_UPDATE_LENGTH) {
        await update(keys, cases);
        keys = [];
        cases = faked.map(() => []);
        length = 0;
      }
      keys.push(key);
      whens.forEach((when, i) => cases[i].push(when));
      length += rowLength;
    }
    if (keys.length > 0) await update(keys, cases);
  }

  for (const table of PII_COPY_TABLES) {
    await target.executeSql(`DELETE FROM ${target.escapeIdentifier(table)}`);
  }
}

/**
 * Rules to apply on restore: only for environments that opt in, and only when
 * the archive was not already pseudonymized at backup time.
 */
export function rulesForRestore(
  environment: { name: string; pseudonymize?: boolean },
  rules: PseudonymizeRules | undefined,
  archivePseudonymized: boolean,
): PseudonymizeRules | undefined {
  if (!environment.pseudonymize || archivePseudonymized) return undefined;
  if (!rules) {
    throw new Error(
      `Environment '${environment.name}' sets 'pseudonymize: true', but the config has no 'pseudonymize' rules`,
    );
  }
  return rules;
}
