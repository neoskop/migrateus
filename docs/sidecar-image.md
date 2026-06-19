# Sidecar image (`neoskop/migrateus`)

Migrateus performs every database operation from a short-lived **sidecar** container that it launches next to the target database (via `docker run`, a k8s pod, or an ACA job) and `exec`s into. That sidecar must contain the CLI tools for whichever engines are involved.

## Why one bundled image

Earlier the sidecar defaulted to a MySQL image, which has no `psql` or `sqlite3` — so operations against other engines failed with `command not found`. A per-engine image doesn't solve it either when a backup was made on one engine and is being restored to another: the sidecar always runs next to the *target* database and must carry that engine's client.

The fix is a single bundled image, `neoskop/migrateus`, that carries the native CLI client for every supported engine:

| Tool | Package | Used for |
| --- | --- | --- |
| `mysql`, `mysqldump` | `mariadb-client` (wire-compatible) | MySQL dump/restore/exec |
| `psql`, `pg_dump` | `postgresql-client-17` (PGDG) | PostgreSQL dump/restore/exec |
| `sqlite3` | `sqlite3` | SQLite introspection/exec |

One image → every engine works out of the box. See [`Dockerfile`](../Dockerfile).

> **Cross-DBMS transfers:** physical backups are engine-specific (a MySQL dump cannot be loaded into PostgreSQL directly). To migrate across engines, use a **logical backup** — re-run `backup-db -l` on the source. The logical path exports and imports Directus data through the API, independent of the underlying engine.

## How it's wired

`DEFAULT_CONTAINER_IMAGE` (in `src/container/container.constants.ts`) is `neoskop/migrateus:latest`, and all three drivers' `clientImage` resolve to it. The backup/restore performers set `containerService.image` from the active driver's `clientImage` before launching the sidecar. Override per run with `--image`:

```bash
migrateus restore-db --image neoskop/migrateus:2.7.0 ./backup.tgz aca-prod
```

## Build & publish

The image is built and pushed by [`.github/workflows/sidecar-image.yml`](../.github/workflows/sidecar-image.yml):

- **Trigger:** when a GitHub release is published (the `Release` workflow tags `v<version>`), or manually via *workflow_dispatch* with a `tag` input.
- **Tags:** `neoskop/migrateus:latest` and `neoskop/migrateus:<version>`.
- **Platforms:** `linux/amd64,linux/arm64`.
- **Secrets required:** `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

> [!IMPORTANT]
> The Docker image must be published **before/with** the npm release that defaults to it, or that npm version's sidecar pull will fail. Ensure the sidecar-image workflow runs successfully for each release tag.

Build locally to test:

```bash
docker build -t neoskop/migrateus:dev .
migrateus restore-db --image neoskop/migrateus:dev ./backup.tgz some-env
```

## Caveats

- **`pg_dump` version:** `pg_dump` must be ≥ the source server's major version. The image pins PostgreSQL **17** client (covers servers ≤ 17). Bump `postgresql-client-NN` in the `Dockerfile` when newer servers appear.
- **Cross-DBMS transfers:** physical backups are engine-specific. Attempting a cross-DBMS physical restore will error with a message pointing at `backup-db -l`. Use logical backup/restore for cross-engine migrations.
- **Image size:** the bundled image is larger than a single-engine client image; acceptable for a throwaway sidecar. Trim packages in the `Dockerfile` if a deployment only needs a subset.
- **Non-root:** the image runs as UID `1000` (`runAsNonRoot`-compatible). The docker platform overrides this at runtime with the host user (`--user $uid:$gid`) so bind-mounted artifacts stay host-owned; k8s/ACA use the image default. `/tmp` (1777) and the backup dir (created mode `0777`) are writable for any UID.
