/**
 * Returns pgloader CAST rules tuned for a Directus SQLite→PG migration.
 *
 * Why these rules:
 * - SQLite stores `DEFAULT NULL` such that pgloader renders it as the literal
 *   string `default 'null'`. On a text column that's harmless, but on numeric /
 *   boolean / temporal columns PostgreSQL rejects it (`invalid input syntax for
 *   type bigint: "null"`), which aborts the WHOLE schema creation. So we
 *   `drop default` on every non-text type.
 * - SQLite booleans are 0/1 integers — map integer(1)/boolean to PG boolean.
 * - SQLite datetimes are ISO text — map to timestamptz and drop NOT NULL so a
 *   null value doesn't violate a constraint.
 *
 * Verified against a live Directus 11.x SQLite→PostgreSQL migration.
 */
export function sqliteToPgCastRules(): string {
  return `CAST
  type integer when (= precision 1) to boolean drop typemod drop default using tinyint-to-boolean,
  type tinyint to boolean drop typemod drop default using tinyint-to-boolean,
  type integer drop default,
  type bigint drop default,
  type smallint drop default,
  type real drop default,
  type double drop default,
  type float drop default,
  type numeric drop default,
  type decimal drop default,
  type boolean drop default,
  type datetime to timestamptz drop default drop not null,
  type timestamp to timestamptz drop default drop not null,
  type date to date drop default drop not null,
  type time to time drop default drop not null`;
}
