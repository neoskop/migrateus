# Cross-engine migration — implementation status (Plans 1–5)

Date: 2026-06-18. Branch: `main`. Test suite: **303 passing / 0 failing, 40 suites.**

This feature lets migrateus run `backup-db`/`restore-db`/`schema-diff` from and between Directus instances on different engines (SQLite/MySQL/PostgreSQL) and platforms (docker, docker-compose, k8s, remote-docker-over-SSH, Azure Container Apps). Implemented autonomously, subagent-driven, each plan TDD'd + reviewed.

## What is implemented AND verified (unit tests, mocked exec)

- **Plan 1 — `DbDriver` seam.** `SqlService`/`DirectusUserService` are dialect-agnostic; MySQL logic moved into `MysqlDriver`. (Verified, reviewed READY-TO-MERGE.)
- **Plan 2 — Postgres + SQLite drivers.** `PostgresDriver`, `SqliteDriver`, ANSI escaping, `dropAllTables` per engine, factory wiring, `rename-collection` routed through the driver. (Verified.)
- **Plan 3 — transfer core.** `TransferPlanner` (native vs pgloader), `PgloaderService` (base64-safe load-file write, URL-encoded creds), Directus cast rules, manifest `client`, restore-performer reworked to drop-via-driver + transfer step. (Logic verified; pgloader execution NOT — see below.)
- **Plan 4 — platforms.** Remote-Docker-over-SSH (`DOCKER_HOST` prefix on all docker CLI calls); ACA platform (`AcaService`, `AcaContainerService`, `AcaModule`). (Command shapes verified; live infra NOT.)
- **Plan 5 — detection + wiring.** `DB_CLIENT`/`DB_FILENAME` detection (docker/k8s/aca), `${ENV_VAR}` interpolation, ACA wired into all 6 dispatch points, `AcaBackupService`/`AcaRestoreService`. Sidecar image now selected from the active driver. (Verified; ACA e2e NOT.)

MySQL docker/k8s backup+restore remains **behavior-equivalent** (confirmed by the final whole-branch review).

## Known limitations / NOT verified (require live infrastructure)

These are real and must be addressed/validated before production use. None are exercised by the test suite (no live DB/pgloader/Azure/remote-host available in the build environment).

1. **pgloader cast rules are UNVERIFIED** (`src/transfer/directus-cast-rules.ts`). The SQLite→PG bool/datetime/json casts are authored from Directus schema knowledge and must be validated against a live Directus PG schema.
2. **Sidecar image for the cross-engine (pgloader) path.** `clientImage` now selects the per-engine *native* CLI image (mysql/postgres/sqlite3). The pgloader path additionally needs an image bundling `psql` + `pgloader` (+ sqlite). Supply one via `--image`, or build a bundled "migrateus tools" image. A bundled image is NOT yet provided.
3. **Remote-Docker-over-SSH: HTTP plane not tunneled (Critical for the Dokploy source side).** `DOCKER_HOST=ssh://…` moves the docker *daemon* calls, but Directus *HTTP* access (asset backup/restore, version compare, the `localhost:8055` health poll, schema-diff SDK) still targets `localhost`. Remote-docker asset/version operations will fail until an SSH tunnel for `8055` (mirroring the k8s `PortForwardService`) or a configurable Directus URL is added.
4. **SQLite source on docker/k8s.** The sidecar reaches the DB over TCP + a `/tmp` bind-mount; a SQLite file lives in the *Directus* container's volume, unreachable from a TCP sidecar. Producing the raw `.sqlite` artifact needs a platform change (mount the Directus volume, or `docker cp` from the Directus container).
5. **ACA end-to-end UNVERIFIED.** `az containerapp exec` stdout capture (interactive TTY), `revision restart` command shape, base64-through-exec file transfer (small payloads only; large `.sqlite` needs an Azure Files share), and Directus HTTP reachability (assumed `localhost:8055`) all need a live ACA environment. `az` command shapes are unverified. ACA exec quoting for SQL-bearing commands is one nesting level off and will need rework once exec is verified.
6. **MySQL→Postgres** transfer intentionally throws `NotYetSupported` (pgloader can't read a `mysqldump` file; the temp-MySQL shim is deferred).
7. **`schema-diff` on ACA** shares a single `AcaContainerService` instance across concurrent `diff()` calls (k8s constructs one per call). Fine for sequential use; revisit for concurrency.

## Minor / cleanup
- `restoreMysqlDump`/`performMysqlDump` on `SqlService` are now engine-agnostic but keep MySQL-flavored names (still used by `migrate-data`, out of scope). Rename when next touched.
- `backup-performer.spec.ts` writes an `output.tar.gz` into the repo root during the test run — add to `.gitignore` or redirect the test to a temp dir.
- `${VAR}` interpolation: a resolved env value beginning with `$word` could be re-substituted by the legacy `$VAR` pass (edge case; quote values in YAML to avoid).

## Commits (Plans 2–5, on `main`)
`afa92ec d6e49d2 93d9d29 063a441 6816dee 5c89807 e2f7d59 8e42b2e 459d4cf e5fa7f7 e0d229b b86d5ed`
(Plan 1: `765145e fcf3598 c2b1673 915ff31`.)
