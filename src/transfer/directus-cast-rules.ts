// NOTE: These cast rules are authored from Directus schema knowledge and are UNVERIFIED
// against a live Directus PG instance — they must be validated before production use.

/**
 * Returns pgloader CAST rules tuned for a Directus SQLite→PG migration.
 * Maps SQLite affinities to the PG types Directus expects.
 */
export function sqliteToPgCastRules(): string {
  return `CAST
  type tinyint to boolean drop typemod using tinyint-to-boolean,
  type integer when (= precision 1) to boolean drop typemod using tinyint-to-boolean,
  type datetime to timestamptz drop default drop not null using zero-dates-to-null,
  type timestamp to timestamptz drop default drop not null using zero-dates-to-null,
  type date to date drop not null using zero-dates-to-null`;
}
