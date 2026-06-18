# Plan 2: Postgres & SQLite drivers + close the dialect layer

> Executed autonomously (subagent-driven) on `main`. Unit tests mock `exec`, matching the repo's existing pattern (no live DB needed).

**Goal:** Add `PostgresDriver` and `SqliteDriver` behind the `DbDriver` seam from Plan 1, wire the factory, and pull the LAST two MySQL leaks (`dropAllTables`, `rename-collection`) behind the driver so `SqlService` + friends are fully dialect-agnostic.

## Decisions (made autonomously; documented here)

- **Add `dropAllTables(exec: Exec): Promise<void>` to `DbDriver`.** The drop-all-tables logic currently hardcoded in `restore-performer.ts` is dialect-specific and belongs in the driver. Plan 3 rewires `restore-performer` to call it.
  - MySQL: the existing stored-procedure approach (port the `restore-performer` proc), or introspect `INFORMATION_SCHEMA.TABLES` + `DROP TABLE` each with `foreign_key_checks=0`. Use the introspect-and-drop form (simpler, no DELIMITER needed over a single `-e`).
  - Postgres: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (Directus re-bootstraps a fresh schema; acceptable for a restore target that must be empty).
  - SQLite: `PRAGMA foreign_keys=OFF`; `listTables` then `DROP TABLE "x"` for each (skip `sqlite_*`).
- **`DatabaseConfig` gains `filename?: string`** for SQLite (path to the DB file inside the container). SQLite ignores host/port/user/password.
- **SQLite dump/restore are raw file copies via `exec` `cp`** (`cp <filename> <artifact>` / `cp <artifact> <filename>`), NOT `.dump` SQL — so the artifact is the raw `.sqlite` file pgloader needs in Plan 3. Same-engine sqlite→sqlite restore is also a file copy.
- **New escaping helpers** in `sql-escape.ts`: `escapeAnsiString` (standard SQL: double `'`), `escapeAnsiIdentifier` (double `"`, double embedded `"`). Postgres and SQLite share these (both ANSI-quote). Keep the 100% coverage threshold on `sql-escape.ts` satisfied with dedicated tests.
- **`rename-collection`** routes through driver helpers exposed on `SqlService` (`escapeIdentifier`, `escapeString`, `disableFks`/`enableFks`), and drops the MySQL-only `c.group` table-alias-in-SET (use `UPDATE directus_collections SET <group> = …` with `group` quoted via `driver.escapeIdentifier`).
- Clean up the two deferred Plan-1 Minors: remove the stray `// Plans 2 add…` comment in the factory and the dead `_databaseConfig` field in `SqlService`.

## DbDriver interface additions

```ts
// add to DbDriver:
dropAllTables(exec: Exec): Promise<void>;
```
PostgresDriver and SqliteDriver implement the full `DbDriver`; MysqlDriver gains `dropAllTables`.

## Per-engine reference

| concern | PostgresDriver (`client:'pg'`) | SqliteDriver (`client:'sqlite3'`) |
|---|---|---|
| clientImage | `postgres:17-alpine` (has `pg_dump`/`psql`) | `keinos/sqlite3:latest` (or `alpine` + `sqlite`) |
| connect | `PGPASSWORD=<pw> psql -h<host> -p<port> -U<user> -d<name>` | file path `config.filename` |
| dump | `PGPASSWORD=… pg_dump -h… -p… -U… <name> > <artifact>` | `cp <filename> <artifact>` |
| restore | `PGPASSWORD=… psql -h… -p… -U… <name> < <artifact>` | `cp <artifact> <filename>` |
| executeSql | `PGPASSWORD=… psql -tA -h… -U… -d<name> -c "<sql>"` | `sqlite3 <filename> "<sql>"` |
| quote ident | `escapeAnsiIdentifier` (`"x"`) | `escapeAnsiIdentifier` (`"x"`) |
| escape string | `escapeAnsiString` (`''`) | `escapeAnsiString` (`''`) |
| listTables | `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'` | `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'` |
| boolLiteral | `true`/`false` | `1`/`0` |
| deleteOne | `DELETE FROM t WHERE w` (no LIMIT) | `DELETE FROM t WHERE w` (no LIMIT) |
| disableFks/enableFks | `SET session_replication_role = replica` / `= origin` | `PRAGMA foreign_keys=OFF` / `=ON` |
| dropAllTables | `DROP SCHEMA public CASCADE; CREATE SCHEMA public` | per-table drop w/ PRAGMA off |
| postRestoreFixups | reset sequences: for each `information_schema.sequences`, `SELECT setval(...)` from owning column max | noop |

## Tasks

- **T1 — escaping helpers.** Add `escapeAnsiString`/`escapeAnsiIdentifier` to `sql-escape.ts` + tests in `sql-escape.spec.ts` (cover null/undefined, embedded `'`/`"`, empty-identifier throw). Keep 100% coverage.
- **T2 — drivers + interface + factory.** Add `dropAllTables` to `DbDriver`; implement it on `MysqlDriver`; create `postgres.driver.ts` + `sqlite.driver.ts` implementing the full interface per the table; add `filename?` to `DatabaseConfig`; extend `createDbDriver` with `pg`/`sqlite3` cases and remove the stray comment. Unit tests (`postgres.driver.spec.ts`, `sqlite.driver.spec.ts`, factory spec update) mocking `exec`, asserting wire-command shapes + error paths.
- **T3 — rename-collection + SqlService helpers + cleanup.** Expose `escapeIdentifier`/`escapeString`/`disableFks`/`enableFks` on `SqlService` (delegating to the driver); refactor `rename-collection.service.ts` to use them and drop the `c.group` alias; remove the dead `_databaseConfig` field. Update/add tests; full suite green.

Each task ends with `pnpm test` green and a Conventional-Commit (no `Co-Authored-By`).
