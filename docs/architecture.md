# Migrateus architecture (30-second mental model)

Migrateus moves a Directus instance's **database** and **assets** between environments. Two orthogonal abstractions do the work:

- **Platform** (`docker`, `docker-compose`, `k8s`, `aca`) — *where/how* to reach things. Implemented as `ContainerService` (the sidecar) + a platform service (`DockerService`/`K8sService`/`AcaService`) that knows the **Directus** container/pod and its env. `docker`/`docker-compose` also support a **remote daemon over SSH** (`host: ssh://…` → `DOCKER_HOST`).
- **DbDriver** (`mysql`, `pg`, `sqlite3`) — *which* SQL/CLI dialect. Selected at runtime from the Directus env's `DB_CLIENT`.

## The one rule that explains the rest

> **The sidecar exists only to run DB *server* tools** (`mysqldump`/`mysql`, `pg_dump`/`psql`, and `pgloader` for cross-engine). A **file database (SQLite)** isn't reached through the sidecar at all — its file lives *in the Directus container*, so migrateus **copies the file directly to/from the Directus container** with `docker cp`. No mounting (so no RWX volumes), no sidecar, no SQL, no HTTP.

`DbDriver.usesSidecar` encodes this: `true` for mysql/pg, `false` for sqlite. The backup/restore performers branch on it:

| | Server engines (`usesSidecar: true`) | SQLite (`usesSidecar: false`) |
|---|---|---|
| Sidecar | created (`neoskop/migrateus` image, all CLIs + pgloader) | **none** |
| Backup | `mysqldump`/`pg_dump` in sidecar → artifact (`backup.sql`) + asset API | `docker cp` the DB file (`*.db`/`-wal`/`-shm`) + the local-storage uploads dir, out of the Directus container |
| Restore | drop tables + `psql`/`mysql` (or `pgloader`) in sidecar | `docker cp` the files back in, then restart Directus |
| Directus HTTP (`localhost:8055`) | used for assets/version | not used |
| Platforms | all | docker / docker-compose only (k8s/ACA + SQLite → clear error) |

## Cross-engine (SQLite → PostgreSQL)

The *target* engine decides the flow. A Postgres target uses the sidecar; `TransferPlanner` routes `sqlite3 → pg` to **pgloader**, which reads the `database.sqlite` from the backup artifact. `MySQL → Postgres` is not yet supported; cross-engine asset migration is DB-only for now.

## Where things live

- `src/sql/db-driver/` — `DbDriver` + `mysql`/`postgres`/`sqlite` drivers + factory.
- `src/container/` — `ContainerService` (sidecar) per platform; `copyFromDirectus`/`copyToDirectus` reach the Directus container (docker only).
- `src/{docker,k8s,aca}/` — platform services (Directus identity, env, restart).
- `src/{backup-db,restore-db}/` — performers (the `usesSidecar` branch + `copyDatabaseOut`/`copyDatabaseIn`).
- `src/transfer/` — `TransferPlanner` + `PgloaderService` (cross-engine).
- The sidecar image: [`sidecar-image.md`](sidecar-image.md).
