import { createHash, randomBytes } from 'node:crypto';
import { faker } from '@faker-js/faker';

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
const UPDATE_CHUNK_SIZE = 500;

/** Directus system tables that keep copies of item data or user sessions. */
const PII_COPY_TABLES = [
  'directus_revisions',
  'directus_activity',
  'directus_sessions',
];

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
 * the SQLite driver executes only the first statement of a batch.
 * ponytail: chunks travel as exec arguments; switch to copying a .sql file
 * into the container if ACA exec rejects the argument length.
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

    for (let i = 0; i < pks.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = pks.slice(i, i + UPDATE_CHUNK_SIZE);
      const keys = chunk.map((key) => target.escapeString(key));
      const assignments = fields.map(([field, path]) => {
        const f = target.escapeIdentifier(field);
        const cases = chunk
          .map(
            (key, j) =>
              `WHEN ${keys[j]} THEN ${toSqlLiteral(fakeValue(path, `${salt}:${table}:${key}:${field}`), target)}`,
          )
          .join(' ');
        // Keep NULLs NULL. No `= ''` check: it errors on non-text columns in Postgres.
        return `${f} = CASE WHEN ${f} IS NULL THEN NULL ELSE CASE ${p} ${cases} END END`;
      });
      await target.executeSql(
        `UPDATE ${t} SET ${assignments.join(', ')} WHERE ${p} IN (${keys.join(', ')})`,
      );
    }
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
