# Migrateus: DbDriver abstraction + remote/ACA platforms

- **Date:** 2026-06-18
- **Status:** Design (approved sections, pending written-spec review)
- **Goal:** Configure environments in a `migrateus.yml` and run `backup-db`, `restore-db`, and `schema-diff` *from and between* a Dokploy-hosted Directus (SQLite) and Azure Container Apps (ACA)-hosted Directus (PostgreSQL) — and between two ACAs. This requires migrateus to stop assuming MySQL everywhere and to support cross-engine transfer and additional execution targets.

## Background

migrateus today is hardwired to MySQL and to a "shell into a sidecar container that runs the `mysql`/`mysqldump` CLI over TCP" model:

- `SqlService` (`src/sql/sql.service.ts`) emits `mysqldump`, `mysql`, `ALTER TABLE … CONVERT TO CHARACTER SET … COLLATE`, `SET foreign_key_checks`, `INFORMATION_SCHEMA.*` queries.
- Dialect also leaks into `DirectusUserService` (`DELETE … LIMIT 1`, `admin_access = 1`, `LIKE`) and `sql-escape.ts` (backtick quoting).
- The default sidecar image is `mysql:9.5.0-oraclelinux9` (`src/container/container.constants.ts`).
- `ContainerService` (`src/container/container.service.ts`) is the platform surface: `execute`, `exfilFile`, `infilFile`, `setup`, `cleanUp`. Implementations exist for `docker`, `docker-compose`, `k8s`. Connection params are read from the Directus app env (`DB_HOST`/`DB_PORT`/…).

Two independent things are tangled: **which dialect** to speak, and **where/how** to run commands. SQLite breaks the second assumption (no server, no port, file in a volume); PostgreSQL breaks the first.

## Decisions (locked during brainstorming)

1. **Approach A — abstract the dialect.** Introduce a `DbDriver` abstraction with `mysql`, `postgres`, and `sqlite` implementations. (Chosen over a Directus-SDK/API import path because DB-level migration is faster *and* deliberately copies the `directus_*` tables — users, roles, policies, settings — which the API path does not.)
2. **Cross-engine transfer via pgloader.** `*→PostgreSQL` conversion uses [pgloader](https://pgloader.io). Consequence: pgloader only *writes* to PostgreSQL, so cross-engine works `*→Postgres`; same-engine transfers (PG→PG, MySQL→MySQL) stay on native dump/restore. This fits the goal (all targets are ACA Postgres).
3. **Execution stays as an ephemeral sidecar inside each platform.** Each command's sidecar lives in its own platform; the on-disk artifact is the bridge between `backup-db` and `restore-db`. No single process needs simultaneous reach to both source and target.
4. **The backup artifact is target-agnostic.** `backup-db` is a function of the *source engine only* and takes no `--target`. All target-specific conversion happens at restore time.
5. **No Dokploy-specific platform.** Dokploy is just Docker (Swarm) on a host. Extend the existing `docker`/`docker-compose` platforms with a remote-daemon-over-SSH option (`DOCKER_HOST=ssh://…`). ACA is a genuinely different platform and gets its own implementation.

## Architecture: two orthogonal axes

```
Command (backup-db / restore-db / schema-diff)
        │
        ├── Environment (migrateus.yml) resolves to:
        │        • Platform   = WHERE/HOW to run things  (ContainerService impl)
        │        • DbDriver   = WHICH SQL/CLI dialect to speak
        │
   ┌────┴───────────────┐
   │                    │
Platform            DbDriver
(launch sidecar,    (dump / restore / listTables /
 exec, cp files,     escape / fk toggle / fixups /
 read app env)       directus-user + asset ops)
   │                    │
docker (local|ssh)  mysql
docker-compose      postgres
   (local|ssh)      sqlite
k8s
aca
```

- **Platform** knows nothing about SQL. It launches a throwaway sidecar next to the DB, execs commands, copies files in/out, and reads the Directus app env. This is the existing `ContainerService` contract.
- **DbDriver** knows nothing about docker vs ACA. Given an `Exec` handle bound to a sidecar, it emits engine-specific commands.
- They meet at runtime: the Platform hands the driver an exec handle; the driver decides the commands. This yields `{sqlite, mysql, postgres} × {docker, docker-compose, k8s, aca}` with no per-pair code.

**Engine detection:** the Platform reads the Directus app env. `DB_CLIENT` (`mysql`/`pg`/`sqlite3`) selects the driver. SQLite has no host/port — it uses `DB_FILENAME`, a path inside the Directus volume. `migrateus.yml` may override engine + connection explicitly via an optional `db` block.

## Component 1: `DbDriver`

`SqlService` becomes a thin orchestrator holding a `DbDriver` + a `ContainerService`, delegating all dialect choices to the driver. `DirectusUserService` and `setAssetStorage` stop importing `escapeMysqlString` directly; they build SQL through the active driver.

```ts
type Exec = (cmd: string) => Promise<ExecOutputReturnValue>; // bound to the platform sidecar

interface DbDriver {
  readonly client: 'mysql' | 'pg' | 'sqlite3';   // matches Directus DB_CLIENT
  readonly clientImage: string;                   // sidecar image carrying this CLI (+ pgloader)

  // dump / restore (native, same-engine)
  dump(exec: Exec, artifact: string, tables?: string[]): Promise<void>;
  restore(exec: Exec, artifact: string): Promise<void>;
  postRestoreFixups(exec: Exec): Promise<void>;   // mysql: charset CONVERT; pg: reset sequences; sqlite: noop

  // introspection
  listTables(exec: Exec): Promise<string[]>;

  // wire exec + escaping
  executeSql(exec: Exec, sql: string): Promise<string>; // -e / psql -c / sqlite3, with engine quoting
  escapeString(v: string): string;
  escapeIdentifier(v: string): string;
  assertSafeIdentifier(v: string, ctx: string): string;

  // dialect helpers the directus-user / asset ops need
  boolLiteral(b: boolean): string;                 // mysql/sqlite '1' | pg 'true'
  deleteOne(table: string, where: string): string; // mysql 'DELETE … LIMIT 1' | pg/sqlite plain DELETE
  disableFks(): string;
  enableFks(): string;
}
```

Per-engine concrete differences:

| concern | MysqlDriver (move existing) | PostgresDriver | SqliteDriver |
|---|---|---|---|
| dump | `mysqldump --compatible=ansi …` | `pg_dump` | **copy the `.sqlite` file out** (no server) |
| restore | `mysql < dump` | `psql < dump` / `pg_restore` | copy file in / `sqlite3 < .dump` |
| connect | `-h -P -u -p` TCP | `PGPASSWORD … -h -p -U -d` | **file path, no host/port/auth** |
| identifier quote | `` `x` `` | `"x"` | `"x"` |
| list tables | `INFORMATION_SCHEMA.TABLES` | `information_schema` / `pg_catalog` | `sqlite_master` |
| fk toggle | `SET foreign_key_checks=0/1` | `SET session_replication_role=replica/origin` | `PRAGMA foreign_keys=OFF/ON` |
| bool literal | `1` | `true` | `1` |
| `DELETE … LIMIT 1` | supported | not supported → plain DELETE | plain DELETE |
| post-restore | charset `CONVERT TO …` | reset sequences to `max(id)` | none |

SQLite is absorbed as one driver's implementation detail: `dump`/`restore` degrade to `exfilFile`/`infilFile`, and `connect` carries a path instead of a `host:port`. The "file DB has no server" problem is invisible to commands.

## Component 2: cross-engine transfer flow

`backup-db` and `restore-db` remain separate commands joined by an artifact on the operator's disk (a `tgz` today). A `TransferPlanner` chooses the path from `(manifest.sourceEngine, targetEngine)` at restore time.

```
backup-db  (knows SOURCE only, no --target)         restore-db  (reads artifact.sourceEngine + TARGET)
───────────────────────────────────────────        ──────────────────────────────────────────────────
sqlite  → copy .sqlite file       ─┐                 plan(artifact.source, target):
mysql   → mysqldump               ─┼─► artifact        same engine      → driver.restore + fixups
postgres→ pg_dump                 ─┘   + manifest       → Postgres       → pgloader (+ cast rules)
                                                        (mysql src → temp-MySQL shim first)
```

- **`backup-db` takes no target.** The artifact is the source DB in its own native form (sqlite file / mysqldump / pg_dump) plus a small **manifest** (`sourceEngine`, Directus version, table list, timestamp). One backup can feed any number of targets.
- **`restore-db` owns all target coupling.** It reads `manifest.sourceEngine`, inspects the target engine, and the `TransferPlanner` picks native restore (same engine) or pgloader (`→Postgres`).
- **SQLite → Postgres** (the primary real case): the artifact *is* the `.sqlite` file; the target sidecar runs `pgloader source.sqlite postgresql://…@localhost/db`. pgloader recreates schema **and** copies all rows, including `directus_*` tables. The target Postgres must be empty first — reuse the existing drop-all-tables step.
- **MySQL → Postgres** (secondary, heavier): pgloader can't read a `mysqldump` file, so the target sidecar materializes the dump into a throwaway MySQL, then `pgloader mysql://localhost → pg`. A CSV-per-table artifact is a possible later simplification.

**Critical detail — Directus-tuned pgloader cast rules.** SQLite stores Directus booleans as `0/1` ints and datetimes as ISO text. Default pgloader casts will not yield the `boolean`/`timestamptz` columns Directus-on-Postgres expects. migrateus ships a curated pgloader **cast-rules file** (bool, datetime, json, uuid) tuned for the Directus schema. This is the one piece requiring real testing against a live Directus Postgres instance.

## Component 3: platforms

All platforms are `ContainerService` implementations: `setup` (launch sidecar) / `execute` / `exfilFile` / `infilFile` / `cleanUp` + reading the Directus app env. The sidecar image carries the needed CLIs + pgloader (simplest: one image with all three clients + pgloader).

### docker / docker-compose — local or remote-over-SSH

Add an optional `host` (e.g. `ssh://deploy@dokploy.example.com`) to `DockerEnvironment` and `DockerComposeEnvironment`. When set, the service runs its docker commands with `DOCKER_HOST` in the exec env (shelljs `exec` accepts an `env`). Docker's native SSH transport (≥ 18.09) makes `create`/`exec`/`cp`/`inspect`/`run` target the remote daemon transparently, so `execute`/`exfilFile`/`infilFile`/discovery work unchanged — only the endpoint moves. This covers Dokploy, Coolify, or any remote dockerd; there is **no Dokploy-specific platform**.

Swarm caveats (Dokploy runs Docker Swarm), to handle in the docker platform:

1. **Resolve the task container.** Dokploy deploys apps as Swarm *services* with generated container names. Add a "find container by service name / label" step (`docker ps --filter label=…`) rather than relying on a fixed `containerName`.
2. **Sidecar networking.** Attach the sidecar with `--network container:<directus-container>` (share Directus's network namespace) to sidestep overlay-network `attachable` constraints and guarantee the sidecar reaches whatever Directus reaches.
3. **Multi-node Swarm limitation.** Over a remote daemon, `exec`/`cp` only reach containers on that daemon's own node. Fine for the common single-node Dokploy install; documented as a limitation for multi-node.

Security note: a remote Docker daemon over SSH is root-equivalent on the host. SSH transport (vs. an exposed TCP socket) is the safer choice; key handling follows the same `${ENV_VAR}` convention as other secrets.

### aca — Azure Container Apps

Mirrors the k8s platform almost 1:1:

- **Discover env:** `az containerapp show` → `DB_CLIENT`/`DB_*` from the Directus app's env + secrets.
- **Sidecar:** create a throwaway Container App in the **same ACA environment** (shares the VNet → reaches Azure Database for PostgreSQL), command `sleep infinity`. `az containerapp exec` ≙ `kubectl exec`. Delete on cleanup.
- **Files:** small payloads → base64 pipe through `exec`; large `.sqlite` artifacts → mount an **Azure Files** share and read/write the artifact there.

### schema-diff is platform/dialect-agnostic already

`schema-diff` talks to the two Directus instances over the SDK. It needs only each environment's Directus URL + admin token and requires zero new dialect or platform code; it works across any platform/engine pair, including ACA↔ACA.

## Component 4: `migrateus.yml` + command UX

Extends the existing discriminated-union `Environment` (`src/config/environment.interface.ts`, keyed on `platform`). Secrets stay out of the file via `${ENV_VAR}` interpolation.

```yaml
environments:
  - name: dokploy-prod              # source: remote Docker host + SQLite
    platform: docker
    host: ssh://deploy@dokploy.example.com
    service: directus               # resolved to the running Swarm task container
    # db: auto-detected from Directus env (DB_CLIENT=sqlite3, DB_FILENAME=…)

  - name: aca-staging               # target: ACA + Postgres
    platform: aca
    aca:
      subscription: ${AZ_SUBSCRIPTION}
      resourceGroup: rg-directus
      environment: cae-directus      # ACA managed environment (shared VNet)
      app: directus
      filesShare: migrateus-artifacts # optional, for large artifact transfer
    # db: auto-detected (DB_CLIENT=pg, DB_HOST/…)

  - name: aca-prod                  # another ACA + Postgres (for ACA↔ACA)
    platform: aca
    aca: { subscription: ${AZ_SUBSCRIPTION}, resourceGroup: rg-prod, environment: cae-prod, app: directus }
```

New / changed TypeScript interfaces (matching the existing pattern):

```ts
interface DockerEnvironment extends Environment {
  platform: 'docker';
  containerName?: string;   // fixed container (local)
  service?: string;         // OR resolve a Swarm/compose service to its task container
  host?: string;            // ssh://user@host → DOCKER_HOST; omitted = local daemon
}
interface DockerComposeEnvironment extends Environment {
  platform: 'docker-compose';
  serviceName?: string;
  composeFile?: string;
  host?: string;            // ssh://user@host
}
interface AcaEnvironment extends Environment {
  platform: 'aca';
  aca: { subscription: string; resourceGroup: string; environment: string; app: string; filesShare?: string };
}
// optional on the base Environment:  db?: DbConnectionOverride  (client + sqlite path | host/port/name/user/password)
```

Commands take environment name(s); engine + platform resolve from the entry:

```
migrateus backup-db   --env dokploy-prod [--tables a,b]      # → artifact + manifest, target-agnostic
migrateus restore-db  --env aca-staging  --artifact ./dump   # reads manifest, plans transfer
migrateus schema-diff  --source dokploy-prod --target aca-staging [--apply]
```

- Dokploy-SQLite → ACA-Postgres: `backup-db --env dokploy-prod` then `restore-db --env aca-staging` (pgloader path).
- ACA ↔ ACA (PG→PG): same two commands, same-engine native restore, no pgloader.
- `schema-diff` between any two: SDK-only.

## Out of scope (this spec)

- `migrate-data` enhancements (pseudonymization, automated relational setup) — explicitly future work; this spec does not change `migrate-data`.
- Cross-engine targets other than PostgreSQL (e.g. `*→MySQL`) — not supported by pgloader; not required by the goal.
- Multi-node Docker Swarm exec/cp routing across nodes.

## Risks / unknowns to validate during implementation

1. **pgloader cast rules for Directus** — the highest-risk item; needs testing against a real Directus Postgres schema so booleans/datetimes/json/uuid map to the columns Directus expects.
2. **ACA file transfer ergonomics** — base64-through-exec vs. Azure Files mount for large `.sqlite` artifacts; confirm `az containerapp exec` is scriptable headlessly with usable stdout/exit codes.
3. **Swarm container resolution + network namespace sharing** on a real Dokploy host (`--network container:<id>` reachability to the DB).
4. **MySQL→Postgres temp-MySQL shim** — confirm the heavier path is acceptable, or defer MySQL→PG.
