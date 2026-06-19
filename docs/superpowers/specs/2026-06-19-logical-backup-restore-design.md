# Logical (Directus-native) backup & restore

- **Date:** 2026-06-19
- **Status:** Design (approved in brainstorming; pending written-spec review)
- **Goal:** Add an opt-in **logical** backup/restore path that moves a Directus instance's schema + data + assets through the **Directus API** (engine-agnostic), so a Directus instance can be migrated **across DBMS** (e.g. SQLite → PostgreSQL). The existing **physical** path (DB-native dump/restore + SQLite file copy) stays for **same-DBMS** migrations. Cross-DBMS restore from a physical backup is replaced by a clear error pointing at `-l`.

## Background / why

Cross-DBMS physical migration via pgloader cannot faithfully reproduce a Directus schema: pgloader drops non-integer primary keys, can't quote reserved-word columns (`user`, `group`) in FK DDL, and mis-converts Directus's SQLite value encodings — so Directus won't boot on the result (verified: `getAllowedSort … reading 'primary'`). Only Directus itself knows its exact schema and value semantics. The logical path therefore goes through Directus: `schemaSnapshot`/`schemaApply` for structure and the items/assets API for data, which converts everything correctly and produces a schema Directus runs on.

**Constraint honored throughout: keep one mechanism, avoid divergent code paths.** Logical reuses the existing Directus services; the only intentional split is the separate logical performer classes (requested for readability).

## Decisions (locked in brainstorming)

1. **Unified temp-admin via the Directus CLI.** The Directus image has **no `sqlite3` CLI** but ships `node /directus/cli.js` with `roles create --admin` and `users create`. Replace the per-dialect SQL `setupDirectusUser` with an engine-agnostic temp admin created via the Directus CLI (run *inside the Directus container*), then `POST /auth/login` for a token, and delete on cleanup. Used by **both** physical and logical paths. This removes the per-dialect user-INSERT/DELETE SQL (and the now-unused `boolLiteral`/`deleteOne` driver helpers) and fixes the SQLite temp-user gap.
2. **Logical is opt-in on backup, auto-detected on restore.** `backup-db -l/--logical` produces a logical artifact; restore reads `meta.json.format` and dispatches.
3. **Remove the pgloader cross-engine path.** `PgloaderService`, `directus-cast-rules.ts`, and `TransferPlanner`'s pgloader mode are deleted; `pgloader` drops out of the sidecar image. `transferRestore` reduces to: same engine → native restore; different engine → error.
4. **Scope of a logical backup (v1):** schema (user collections) + all user-collection data + the core system collections **`directus_users`, `directus_roles`, `directus_policies`, `directus_permissions`, `directus_access`, `directus_settings`** + files/assets. Flows, operations, dashboards, panels, presets, translations, webhooks are **out of scope for v1** (add later if needed).
5. **Restore target = a freshly-bootstrapped Directus.** Apply schema, import items preserving IDs; for the carried system collections the **source is authoritative** (replace). The temp admin is separate from the imported users, so it survives the user/role swap.
6. **Import ordering = topological sort + two-pass patch** (see below). Pure-API, no DB-level FK disabling.

## Architecture

```
backup-db [-l]                              restore-db  (reads meta.json.format)
   │                                            │
   ├─ no -l → physical (unchanged):             ├─ format:'physical' → physical restore (unchanged)
   │   native dump / sqlite file copy           │     • same engine → native restore
   │                                            │     • different engine → ERROR: "use backup-db -l"
   └─ -l → LogicalBackupPerformer               └─ format:'logical' → LogicalRestorePerformer
```

- **One** `LogicalBackupPerformer` + **one** `LogicalRestorePerformer` (not per-platform). They depend only on: the Directus HTTP port (existing `getDirectusPort` per platform) and a **"directus exec"** handle. Platform specifics are supplied by a thin per-platform adapter, not by subclassing.
- **New "exec in the Directus container" capability** on each platform service: `DockerService.execInDirectus(cmd)` (`docker exec <directusId> …`), `K8sService.execInDirectus` (`kubectl exec <directus-pod> -- …`), `AcaService.execInDirectus` (`az containerapp exec --name <app> …`). Used by the unified temp-admin and nothing else new.

## Components

### New
- `src/directus/directus-user/` — repurpose `DirectusUserService` to create/delete the temp admin via the Directus CLI (`execInDirectus`) + `/auth/login`. Public surface stays close to today (`setupUser`/`removeUser`/token) so `SqlService` callers change minimally.
- `src/directus/directus-logical/directus-logical.service.ts` — SDK export/import of collection items: `exportCollection(client, collection)` (paginated `readItems`/`readUsers`/… → array), `importCollection(client, collection, rows, { deferredFields })`. Knows the system-collection endpoints.
- `src/transfer/import-order.ts` — pure function: given the snapshot relations (+ the fixed system-collection order), return `{ order: string[], deferredFieldsByCollection }` via topological sort with back-edges deferred. Unit-tested in isolation.
- `src/backup-db/logical-backup.performer.ts` — `LogicalBackupPerformer`.
- `src/restore-db/logical-restore.performer.ts` — `LogicalRestorePerformer`.

### Reused as-is
- `DirectusService.getClient(port, token)`, `schemaSnapshot`/`schemaDiff`/`schemaApply` (extract the diff/apply helpers from `schema-diff.service.ts` into something callable), `DirectusAssetService.backupAssets`/`restoreAssets`, `DirectusVersionService`.

### Removed
- `src/transfer/pgloader.service.ts`, `src/transfer/directus-cast-rules.ts`, pgloader mode in `transfer-planner.ts`; `pgloader` from `Dockerfile`. Per-dialect `boolLiteral`/`deleteOne` if no longer referenced after the temp-admin change.

## Logical backup flow (`backup-db -l <env> <file>`)
1. Platform setup (reach Directus port) + create temp admin via CLI → token.
2. `schemaSnapshot()` → `snapshot.json`.
3. Compute import order (for the manifest) and export each collection (user + carried system) via the SDK, paginated, to `data/<collection>.json`.
4. `DirectusAssetService.backupAssets()` → `assets/` (reused).
5. `meta.json` = `{ format: 'logical', version, sourceClient, timestamp }`.
6. tar → default filename `migrateus-<env>-<date>-logical.tgz` (the `-l` flag drives the `-logical` suffix in `backup-db.questions.ts defaultTo`).
7. Cleanup: delete temp admin.

## Logical restore flow (`restore-db <file> <env>`, `meta.format==='logical'`)
1. Extract; read `meta.json`. Version check via `DirectusVersionService` (reused; `--force` skips).
2. Platform setup + temp admin → token.
3. `schemaDiff(snapshot)` + `schemaApply(diff)` to create user collections/fields/relations (reuse schema-diff logic).
4. Compute import order from `snapshot` relations + fixed system order.
5. Import collections in order. **Back-edges (self/cyclic FKs):** insert rows with those FK fields nulled, then a second pass patches them. For carried **system** collections, source is authoritative (replace existing rows by ID).
6. `DirectusAssetService.restoreAssets()` (reused).
7. Restart Directus (existing hook) so it picks up the imported schema/data; cleanup temp admin.

## Import ordering (the FK question)
- Many-to-one relation ⇒ "referencing collection depends on referenced collection."
- User-collection relations from `schemaSnapshot().relations`; carried system collections use a fixed known order (`roles → policies → permissions/access`, `files → settings`, `roles → users`).
- Topologically sort; import referenced collections first.
- **Back-edges** (`directus_folders.parent`, `directus_collections.group`, user tree fields, rare cross-collection cycles): two-pass — insert with the offending FK field `null`, then patch after all rows exist.
- A residual FK violation surfaces as a real error (not silently swallowed).

## CLI / metadata changes
- `backup-db`: add `@Option -l, --logical` (sets `config.logical = true`); `BackupDbService` dispatches to `LogicalBackupPerformer` when set, else the existing platform performers.
- `meta.json` gains `format: 'physical' | 'logical'` (absent ⇒ `'physical'` for back-compat). `RestorePerformer`/restore dispatch reads it.
- Physical cross-DBMS guard: `restore-db` of a physical backup whose `meta.sourceClient` ≠ target engine → `throw "This is a physical backup; cross-DBMS restore needs a logical backup — re-run backup-db -l on the source."`

## Out of scope (v1)
- System collections beyond the six listed (flows/operations/dashboards/panels/presets/translations/webhooks).
- Non-local asset storage specifics (handled by the reused asset service as today).
- Incremental/partial logical migration (that's `migrate-data`'s future remit).

## Known limitations / follow-up (documented, not yet implemented)

The following behaviours are deferred to a future iteration and are intentionally **not** implemented in v1:

- **Source-authoritative replace semantics.** The spec (decision 5) states "source is authoritative" for carried system collections, implying existing rows on the target should be deleted before import. This is not yet done — the current restore simply inserts/patches rows by ID. A non-empty target may therefore see constraint violations. Workaround: restore into a freshly-bootstrapped Directus.
- **Password handling.** The Directus REST API masks password hashes on both read and write, so logical backup/restore cannot migrate user passwords. Affected users must reset their password or authenticate via SSO. This limitation is surfaced as a runtime warning at the start of every logical restore and is documented in the README.

## Verification
- **Unit (jest):** `import-order` topo-sort + back-edge deferral (incl. self-ref + a 2-cycle); `DirectusLogicalService` export/import build the right SDK calls (mock the client); `backup-db -l` dispatches to the logical performer and writes `format:'logical'` + `-logical` filename; restore dispatches on `meta.format`; physical cross-DBMS restore throws the guard error; temp-admin helper issues the right `execInDirectus` CLI commands and `/auth/login`. Keep `sql-escape.ts` at 100%.
- **End-to-end (user, real env):** `backup-db -l` the Dokploy SQLite source → `restore-db` into a fresh ACA/local Postgres Directus → **Directus boots and the data/users/settings are present** (the real success criterion the physical path failed). `--no-assets` supported for a DB-only pass.
- Conventional Commits, no `Co-Authored-By`, suite green per task.
