# Logical (Directus-native) backup & restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `backup-db -l` logical (Directus-API) backup and a matching logical restore that migrates Directus across DBMS (SQLite→Postgres), with physical (DB-native) staying for same-DBMS and erroring clearly on cross-DBMS.

**Architecture:** Logical moves schema (`schemaSnapshot`/`schemaApply`) + per-collection items (SDK) + assets through the Directus API, so it's engine-agnostic. A unified temp-admin (Directus CLI `users create`, run inside the Directus container, → `/auth/login` token) replaces the per-dialect SQL temp-user for both paths. The pgloader cross-engine path is removed.

**Tech Stack:** TypeScript (ESM), NestJS, `@directus/sdk` v22 (`createDirectus`/`rest`/`staticToken`, `schemaSnapshot`/`schemaDiff`/`schemaApply`, `readItems`/`createItems`/`readUsers`/…), Jest + ts-jest (`pnpm test`).

## Global Constraints

- ESM: relative imports end in `.js`; `pnpm test` runs the suite; `pnpm build` (nest build) must stay clean.
- Conventional Commits; **NO `Co-Authored-By`**; commit on `main`; full suite green before each commit; keep `sql-escape.ts` at 100% coverage.
- Directus CLI inside the Directus container: `node /directus/cli.js roles create --role <name> --admin` (prints role id), `node /directus/cli.js users create --email <e> --password <p> --role <id>` (prints user id). **There is no CLI delete** — cleanup deletes via the SDK (`deleteUser` then it's done; `deleteRole` best-effort), user last.
- Reuse, don't duplicate: `DirectusService.getClient(port, token)` (`src/directus/directus.service.ts:13`), the schema snapshot/diff/apply flow in `src/schema-diff/schema-diff.service.ts:56-118,~220`, `DirectusAssetService.backupAssets/restoreAssets`, `DirectusVersionService.getVersion/isDangerousMismatch`.
- One mechanism, no unnecessary divergent paths (user constraint). The only intended split is the separate logical performer classes.

---

## File structure

- `src/{docker,k8s,aca}/*.service.ts` — add `execInDirectus(command): Promise<ExecOutputReturnValue>` (exec a command in the **Directus** workload).
- `src/directus/directus-user/directus-user.service.ts` — temp-admin via CLI+login (replaces SQL inserts); `src/sql/sql.service.ts` callers adjusted.
- `src/sql/transfer*` — delete pgloader (`pgloader.service.ts`, `directus-cast-rules.ts`, pgloader mode in `transfer-planner.ts`); `Dockerfile` drops pgloader.
- `src/directus/directus-logical/directus-logical.service.ts` — SDK export/import of collection items.
- `src/transfer/import-order.ts` — topological sort + back-edge deferral (pure).
- `src/backup-db/logical-backup.performer.ts`, `src/restore-db/logical-restore.performer.ts` — the two new performers.
- `src/backup-db/backup-db.command.ts` (+ `.service.ts`, `.questions.ts`), `src/restore-db/restore-db.command.ts` — `-l` flag, dispatch, filename, format detection.
- `src/config/config.service.ts` — add `public logical = false;`.

---

## PHASE A — Groundwork

### Task 1: `execInDirectus` on each platform

**Files:**
- Modify: `src/docker/docker.service.ts`, `src/k8s/k8s.service.ts`, `src/aca/aca.service.ts`
- Test: `src/docker/docker.service.swarm.spec.ts` (extend), `src/k8s/k8s.service.spec.ts`, `src/aca/aca.service.spec.ts`

**Interfaces — Produces:** `execInDirectus(command: string): Promise<ExecOutputReturnValue>` on `DockerService`, `K8sService`, `AcaService`.

- [ ] **Step 1 (docker): write failing test** — with `containerConfig.Id='dir1'` and host `ssh://h`, `execInDirectus('node /directus/cli.js roles create --role r --admin')` runs `DOCKER_HOST=ssh://h docker exec dir1 /bin/sh -c "node /directus/cli.js roles create --role r --admin"` (mock `exec`, assert the command, assert non-zero throws).
- [ ] **Step 2: run, see fail.** Run: `pnpm test -- src/docker/docker.service.swarm.spec.ts`
- [ ] **Step 3: implement** on `DockerService`:
```ts
public async execInDirectus(command: string) {
  const full = this.withHost(
    `docker exec ${this.containerConfig.Id} /bin/sh -c "${command.replaceAll('"', '\\"')}"`,
  );
  const out = await exec(full, { silent: true });
  if (out.code !== 0) {
    throw new Error(`Directus exec failed with code ${out.code}: ${out.stderr}`);
  }
  return out;
}
```
- [ ] **Step 4 (k8s):** resolve the Directus pod (`kubectl get pods -l <directus selector> -o name` — reuse however `K8sService` already finds the directus deployment `directus`; if only the deployment name is known, use `kubectl exec deploy/directus -- /bin/sh -c "…"`). Implement `execInDirectus` via `this.kubectl(\`exec deploy/directus -- /bin/sh -c "${cmd}"\`)`.
- [ ] **Step 5 (aca):** `execInDirectus` via `this.az(\`containerapp exec -n ${app} -g ${rg} --command "/bin/sh -c \\"${cmd}\\""\`)` (mirror `AcaContainerService.execute`; add the same `TODO(verify)` note for headless exec).
- [ ] **Step 6: run the three specs green, then commit.**
```bash
git add src/docker/docker.service.ts src/k8s/k8s.service.ts src/aca/aca.service.ts src/docker/docker.service.swarm.spec.ts src/k8s/k8s.service.spec.ts src/aca/aca.service.spec.ts
git commit -m "feat(platform): add execInDirectus (run a command in the Directus container)"
```

### Task 2: Unified temp-admin via the Directus CLI

**Files:**
- Modify: `src/directus/directus-user/directus-user.service.ts` (+ spec), `src/sql/sql.service.ts` (+ spec), and the performers' `setupDirectusUser`/`cleanUpDirectusUser` call sites if their signature changes.

**Interfaces — Produces:** `DirectusUserService.setupUser(execInDirectus, getClient, port): Promise<void>` creates `roles create --admin` + `users create` (random email/password), then `POST /auth/login` (via the SDK client built with the *bootstrap* — actually use the created credentials) to obtain a token stored on `this.token`. `removeUser(...)` deletes the temp user via SDK `deleteUser(id)` (user last), best-effort `deleteRole(roleId)`. Keep the public `token` field used by `DirectusService` consumers.

- [ ] **Step 1: failing test** — `setupUser` issues `execInDirectus` with `roles create … --admin` then `users create … --role <parsedRoleId>`, parses the printed ids, and logs in for a token. Mock `execInDirectus` (returns role id then user id on stdout) + a fake SDK client whose `/auth/login` returns `{access_token}`. Assert `this.token` is set and the two CLI commands ran in order.
- [ ] **Step 2: run, see fail.**
- [ ] **Step 3: implement.** Generate `roleName = migrateus+<nanoid>`, `email = <roleName>@neoskop.local`, `password = nanoid(48)`. Run the two CLI commands via the injected `execInDirectus`, parse ids from stdout (trim). Build a login client (reuse `DirectusService` with `login`/REST) — or `fetch POST http://localhost:<port>/auth/login` — to get `access_token`; store on `this.token`. Register the password with `RedactService`. Remove all SQL-insert code, `MysqlExecutor` usage, and `escapeMysqlString` from this file.
- [ ] **Step 4: `removeUser`** — via the SDK client (token): `deleteRole(roleId)` wrapped in try/catch (ignore), then `deleteUser(userId)`. Note: deleting the user invalidates the token, so it must be last; the leftover empty role is acceptable (best-effort delete).
- [ ] **Step 5: rewire `SqlService`** — `setupDirectusUser`/`cleanUpDirectusUser`/`cleanUpAllDirectusUsers` now delegate to the new `DirectusUserService` API (pass the platform's `execInDirectus` + a `getClient`/port). The performers already hold the platform service; thread `execInDirectus` through. Remove the now-unused `boolLiteral`/`deleteOne` from `DbDriver` + impls **only if** no remaining caller references them (grep first). `setCredentials`/`setAssetStorage` stay SQL (physical restore) — unchanged.
- [ ] **Step 6: full suite green, build clean, commit.**
```bash
git commit -m "refactor(directus): create the temp admin via the Directus CLI (engine-agnostic), not SQL"
```

> NOTE: this changes physical-server auth too. Verify the existing backup/restore specs still pass; the temp-admin now works for SQLite as a side effect.

### Task 3: Remove pgloader; cross-DBMS physical guard

**Files:**
- Delete: `src/transfer/pgloader.service.ts` (+ spec), `src/transfer/directus-cast-rules.ts` (+ spec)
- Modify: `src/transfer/transfer-planner.ts` (+ spec), `src/sql/sql.service.ts` (`transferRestore`), `src/transfer/transfer.module.ts`, `Dockerfile`, `docs/sidecar-image.md`

**Interfaces — Produces:** `TransferPlanner.plan(source, target)` returns `{ mode: 'native' }` when `source === target`, else **throws** `Error("This is a physical backup; cross-DBMS restore needs a logical backup — re-run 'backup-db -l' on the source.")`.

- [ ] **Step 1: update `transfer-planner.spec.ts`** — same-engine → `{mode:'native'}`; every cross pair throws `/needs a logical backup/`. Run, see fail.
- [ ] **Step 2: implement** the planner (drop `pgloader` mode). Update `SqlService.transferRestore` to: `const {mode}=plan(source,target); // only 'native'`; do `driver.restore`+`postRestoreFixups`; delete the pgloader branch + the post-pgloader `listTables` verification + the `PgloaderService` injection.
- [ ] **Step 3: delete** `pgloader.service.ts`, `directus-cast-rules.ts`, their specs; remove them from `transfer.module.ts`. Remove `pgloader` from the `Dockerfile` package list and update `docs/sidecar-image.md` (sidecar now carries the native clients only; cross-DBMS goes through logical).
- [ ] **Step 4: full suite green, build clean, commit.**
```bash
git commit -m "refactor(transfer): drop pgloader; cross-DBMS physical restore now errors toward logical"
```

---

## PHASE B — Logical backup

### Task 4: `-l` flag, `format` metadata, filename

**Files:** `src/config/config.service.ts`, `src/backup-db/backup-db.command.ts`, `src/backup-db/backup-db.questions.ts`, `src/backup-db/backup-performer.ts` (storeMetadata/storeFileMetadata), `src/restore-db/restore-performer.ts` (readManifest) + specs.

**Interfaces — Produces:** `ConfigService.logical: boolean`; `meta.json` gains `format: 'physical' | 'logical'`; `readManifest` returns `{ version?, client, format }` (absent ⇒ `'physical'`).

- [ ] **Step 1:** add `public logical = false;` to `ConfigService`. Add the `@Option` to `backup-db.command.ts`:
```ts
@Option({ flags: '-l, --logical', description: 'Logical (Directus-API) backup for cross-DBMS migration' })
setLogical() { this.config.logical = true; }
```
- [ ] **Step 2:** `backup-db.questions.ts defaultTo` → append `-logical` when `this.config.logical`:
```ts
const suffix = this.config.logical ? '-logical' : '';
return `migrateus-${answers.from}-${date}${suffix}.tgz`;
```
(inject `ConfigService` — already constructor-injected).
- [ ] **Step 3:** physical `storeMetadata`/`storeFileMetadata` write `format: 'physical'`; `readManifest` reads `parsed.format ?? 'physical'`. Update the existing performer specs that assert meta shape.
- [ ] **Step 4: tests** — `defaultTo` suffix with/without `-l`; `readManifest` returns `format`. Suite green, commit.
```bash
git commit -m "feat(backup): add -l/--logical flag, format metadata, -logical filename"
```

### Task 5: `DirectusLogicalService.exportCollection` + schema snapshot

**Files:** Create `src/directus/directus-logical/directus-logical.service.ts` (+ spec); register in `DirectusModule`.

**Interfaces — Produces:**
```ts
SYSTEM_COLLECTIONS = ['directus_roles','directus_policies','directus_permissions','directus_access','directus_users','directus_settings'] as const
exportSchema(client): Promise<SchemaSnapshotOutput>            // client.request(schemaSnapshot())
exportCollection(client, collection: string): Promise<any[]>   // paginated readItems / system readers
```

- [ ] **Step 1: failing test** — `exportCollection(client,'theo_article')` pages via `readItems('theo_article',{limit,page})` until a short page; returns the concatenated rows. For system collections it uses the system readers (`readUsers`/`readRoles`/… or `readItems('directus_*')` where supported). Mock `client.request` to return two pages then empty.
- [ ] **Step 2: run, see fail.**
- [ ] **Step 3: implement** paginated export (limit e.g. 200, `page` increment, stop when `rows.length < limit`). Map system collection name → its SDK reader; user collections use `readItems(collection, …)`.
- [ ] **Step 4: tests green, commit.**
```bash
git commit -m "feat(directus): add DirectusLogicalService schema + item export"
```

### Task 6: `LogicalBackupPerformer` + dispatch

**Files:** Create `src/backup-db/logical-backup.performer.ts` (+ spec); modify `src/backup-db/backup-db.service.ts`, `src/backup-db/backup-db.module.ts`.

**Interfaces — Consumes:** `DirectusLogicalService`, `DirectusAssetService`, `DirectusVersionService`, the temp-admin (`DirectusUserService` + platform `execInDirectus` + port). **Produces:** `LogicalBackupPerformer.backup(env, backupFile)`.

- [ ] **Step 1: failing test** — `backup()` (mock the services) writes `snapshot.json`, `data/<collection>.json` for each collection in `SYSTEM_COLLECTIONS` + the snapshot's user collections, `meta.json {format:'logical', version, sourceClient, timestamp}`, calls `assetService.backupAssets` unless `--no-assets`, and tars to the file. Assert the temp admin is created + cleaned up.
- [ ] **Step 2: run, see fail.**
- [ ] **Step 3: implement** the flow (spec §"Logical backup flow"): temp admin → token → `exportSchema` → export each collection to `data/<c>.json` → assets → `meta.json` → tar (reuse `createBackupArchive` helper — make it `protected` or extract a shared util) → cleanup temp admin in `finally`.
- [ ] **Step 4: dispatch** in `BackupDbService.backup`: `if (this.config.logical) return this.logicalBackupPerformer.backup(env, file);` before the platform branch. Register `LogicalBackupPerformer` + `DirectusLogicalService` providers in `backup-db.module.ts`.
- [ ] **Step 5: full suite green, build clean, commit.**
```bash
git commit -m "feat(backup): logical backup performer (schema + items + assets) wired to -l"
```

---

## PHASE C — Logical restore

### Task 7: `import-order.ts` (topo-sort + back-edge deferral)

**Files:** Create `src/transfer/import-order.ts` (+ spec).

**Interfaces — Produces:**
```ts
interface Relation { collection: string; field: string; relatedCollection: string }
planImportOrder(collections: string[], relations: Relation[]): {
  order: string[];                                   // referenced before referencing
  deferredFields: Record<string, string[]>;          // collection -> FK fields to null on insert, patch after
}
```

- [ ] **Step 1: failing tests** —
  - linear: `A` (no rel), `B.a→A` ⇒ order `[A,B]`, no deferred.
  - self-ref: `C.parent→C` ⇒ order `[C]`, `deferredFields={C:['parent']}`.
  - 2-cycle: `D.e→E`, `E.d→D` ⇒ both present; one edge deferred (e.g. `deferredFields={E:['d']}` or `{D:['e']}`); order contains both.
- [ ] **Step 2: run, see fail.**
- [ ] **Step 3: implement** Kahn's algorithm; when a cycle remains, pick a back-edge, record its field in `deferredFields`, drop that edge, continue. Self-references are immediate back-edges.
- [ ] **Step 4: tests green, commit.**
```bash
git commit -m "feat(transfer): import-order topo-sort with back-edge deferral"
```

### Task 8: `DirectusLogicalService.importCollection` (two-pass)

**Files:** `src/directus/directus-logical/directus-logical.service.ts` (+ spec).

**Interfaces — Produces:** `importCollection(client, collection, rows, deferredFields: string[]): Promise<void>` — inserts rows (preserving ids) with `deferredFields` set to `null`; if `deferredFields.length`, a second pass `updateItem(collection, id, { <deferredFields> })` per row. System collections use their SDK writers (`createUsers`/`createRoles`/…); for the carried system collections, the **source is authoritative** (the target is freshly bootstrapped — delete pre-existing rows by id where they collide, or upsert).

- [ ] **Step 1: failing test** — with `deferredFields=['parent']`, insert calls omit/null `parent`, then a patch pass sets it; ids are preserved (`createItems` payload keeps `id`). Mock `client.request`.
- [ ] **Step 2: run, see fail.**
- [ ] **Step 3: implement** batched `createItems(collection, batchWithDeferredNulled, {…})`; then patch pass for deferred fields. Map system collection → writer.
- [ ] **Step 4: tests green, commit.**
```bash
git commit -m "feat(directus): two-pass item import preserving ids and deferring back-edge FKs"
```

### Task 9: `LogicalRestorePerformer` + restore dispatch

**Files:** Create `src/restore-db/logical-restore.performer.ts` (+ spec); modify `src/restore-db/restore-db.command.ts`, `src/restore-db/restore-db.module.ts`.

**Interfaces — Consumes:** `DirectusLogicalService`, `planImportOrder`, schema apply (extract `applyDiff`/`schemaDiff` usage from `schema-diff.service.ts` into a reusable method or a small `SchemaApplyService`), `DirectusAssetService`, temp admin, `DirectusVersionService`.

- [ ] **Step 1: failing test** — `restore()` (mock services) extracts the tgz, reads `meta.json` (`format:'logical'`), applies the snapshot via schema apply, computes `planImportOrder` from snapshot relations + `SYSTEM_COLLECTIONS`, imports each collection's `data/<c>.json` in order with deferred fields, restores assets, restarts Directus, cleans up. Assert order respects relations and `importCollection` gets the right `deferredFields`.
- [ ] **Step 2: run, see fail.**
- [ ] **Step 3: implement** (spec §"Logical restore flow"). Version check via `DirectusVersionService` (skip on `--force`).
- [ ] **Step 4: dispatch** in `restore-db.command.ts`: read `meta.json.format` (peek the tgz or extract first); `format==='logical'` → `logicalRestorePerformer.restore(from, to)`; else the existing physical branch. Register providers in `restore-db.module.ts`.
- [ ] **Step 5: full suite green, build clean, commit.**
```bash
git commit -m "feat(restore): logical restore performer (schema apply + ordered item import + assets)"
```

---

## Self-Review

**Spec coverage:** unified CLI temp-admin → T2; execInDirectus → T1; pgloader removal + cross-DBMS guard → T3; `-l`/format/filename → T4; schema+item export → T5; logical backup performer → T6; topo-sort+two-pass FK ordering → T7+T8; logical restore + dispatch → T9; assets reuse → T6/T9; version checks reuse → T6/T9; data scope (6 system collections) → T5 `SYSTEM_COLLECTIONS`. Covered.

**Placeholders:** none; novel logic (execInDirectus, planner, dispatch, flag) has full code; SDK-heavy steps reference exact SDK calls + reuse points with paths.

**Type consistency:** `execInDirectus(command)→ExecOutputReturnValue`, `planImportOrder(...)→{order, deferredFields}`, `SYSTEM_COLLECTIONS`, `meta.format` used consistently across T1/T5/T7/T8/T9.

## Risks / verify during impl
- T2 changes physical-server auth — run the full backup/restore specs; confirm temp-admin timing in physical restore (CLI connects directly to the DB, so a stale running server is fine).
- T9 schema-apply reuse — `schema-diff.service.ts`'s apply path is wrapped in prompts; extract just the snapshot→diff→apply mechanics (no interactive prompt) for the restore.
- End-to-end (user): `backup-db -l` Dokploy SQLite → `restore-db` into fresh Postgres Directus → **Directus boots, data/users/settings present**.
