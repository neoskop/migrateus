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
  type real drop default using (lambda (x) (when x (if (stringp x) (substitute #\\e #\\d x) (format nil "~F" x)))),
  type double drop default using (lambda (x) (when x (if (stringp x) (substitute #\\e #\\d x) (format nil "~F" x)))),
  type float drop default using (lambda (x) (when x (if (stringp x) (substitute #\\e #\\d x) (format nil "~F" x)))),
  type numeric drop default using (lambda (x) (when x (if (stringp x) (substitute #\\e #\\d x) (format nil "~F" x)))),
  type decimal drop default using (lambda (x) (when x (if (stringp x) (substitute #\\e #\\d x) (format nil "~F" x)))),
  type boolean drop default,
  type datetime to timestamptz drop default drop not null using (lambda (x) (if x (let ((n (ignore-errors (parse-integer (format nil "~A" x))))) (if n (unix-timestamp-to-timestamptz (floor n 1000)) x)))),
  type timestamp to timestamptz drop default drop not null using (lambda (x) (if x (let ((n (ignore-errors (parse-integer (format nil "~A" x))))) (if n (unix-timestamp-to-timestamptz (floor n 1000)) x)))),
  type date to date drop default drop not null,
  type time to time drop default drop not null`;
}
