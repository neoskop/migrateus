# Plan 3: cross-engine transfer (manifest + TransferPlanner + pgloader)

> Autonomous, subagent-driven, on `main`. Unit tests mock `exec`/container. **End-to-end cross-engine transfer is NOT verifiable in this sandbox** (no pgloader binary, no live MySQL/PG/SQLite, no Directus). Components are unit-tested; integration is flagged for live verification.

## Decisions (autonomous)

- **Manifest:** extend `meta.json` (written by `backup-performer.storeMetadata`) with `client` (the source engine, from `SqlService.client` → `driver.client`). Restore reads `meta.json.client` to learn the source engine.
- **`SqlService.client` getter** exposes `this.driver.client`.
- **`TransferPlanner`** (pure, unit-tested): `plan(sourceClient, targetClient) → { mode: 'native' | 'pgloader' }`. Rules: equal engines → `native`; `sqlite3→pg` or `mysql→pg` → `pgloader` (but `mysql→pg` currently throws `NotYetSupported` — pgloader can't read a mysqldump file; the temp-MySQL shim is deferred); any `*→(mysql|sqlite3)` cross-engine → throw (`pgloader only targets Postgres`).
- **`PgloaderService`:** builds the pgloader invocation + writes a Directus-tuned cast-rules `.load` file, runs it via `containerService.execute`. SQLite→PG: source is the raw `.sqlite` artifact, target is the local PG connection. Cast rules map SQLite affinities to the types Directus-on-PG expects (bool, timestamps, json, uuid).
- **`restore-performer` rework:**
  - Remove the hardcoded MySQL drop-all-tables stored-procedure prepend in `extractBackupArchive` (it corrupts a binary SQLite artifact and is MySQL-only). Instead, after container setup, call `driver.dropAllTables(exec)` (engine-correct, added in Plan 2).
  - Replace the single `sqlService.restoreMysqlDump(...)` call with a transfer step driven by `TransferPlanner`:
    - `native` → `driver.restore(exec, '/tmp/backup.sql')` then `driver.postRestoreFixups(exec)` (preserves existing MySQL behavior: drop-all + restore + charset fixup).
    - `pgloader` (sqlite3→pg) → `PgloaderService.run(...)`.
    - `mysql→pg` → throw a clear `NotYetSupported` error.
  - The MySQL same-engine path stays behavior-equivalent (drop-all then restore vs. the old prepended-proc-in-one-file — same net effect).

## Known gaps (flagged, not silently skipped)

1. **SQLite source artifact on docker/k8s:** the migrateus sidecar reaches the DB over TCP and bind-mounts `backupDir`↔`/tmp`. A SQLite file lives in the *Directus* container's volume, unreachable from a TCP sidecar. Producing the raw `.sqlite` artifact for a SQLite source requires a platform change (mount the Directus volume into the sidecar, or `docker cp` from the Directus container). Tracked for Plan 4/5. Plan 3 assumes the artifact is present at `/tmp/backup.sql` (raw sqlite bytes) once that lands.
2. **MySQL→PG** transfer throws `NotYetSupported` (temp-MySQL shim deferred).
3. **pgloader cast rules** are authored from Directus schema knowledge but UNVERIFIED against a live Directus PG — must be validated before production use.

## Components / files

- `src/transfer/transfer-planner.ts` + spec — pure planner.
- `src/transfer/pgloader.service.ts` + spec — builds cast-rules `.load` + pgloader command, runs via `execute` (mock in tests).
- `src/transfer/directus-cast-rules.ts` (or a `.load` template string) — the Directus-tuned casts.
- `src/transfer/transfer.module.ts` — Nest module exporting the above.
- `src/backup-db/backup-performer.ts` — `storeMetadata` adds `client`.
- `src/sql/sql.service.ts` — add `client` getter.
- `src/restore-db/restore-performer.ts` — drop-proc removal + transfer step.
- Update affected specs (`k8s-restore.service.spec.ts`, backup specs) to the new drop-all-tables-via-driver flow.

Each task ends with `pnpm test` green; Conventional Commits, no `Co-Authored-By`.
