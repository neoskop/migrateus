# Bundled sidecar image for migrateus.
#
# Migrateus launches a short-lived sidecar next to the database and runs the
# engine's CLI tools inside it. Cross-engine restore (e.g. SQLite -> PostgreSQL)
# needs pgloader AND the target client in the SAME image, so this image carries
# every tool: mysql/mysqldump (MariaDB client), psql/pg_dump (PostgreSQL 17
# client), sqlite3, and pgloader. One image serves all engines and all paths.
#
# Published as `neoskop/migrateus` (see .github/workflows/sidecar-image.yml and
# docs/sidecar-image.md). The CLI defaults to this image and accepts `--image`
# to override (e.g. to pin a version or pg_dump major).
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# PostgreSQL client 17 from PGDG: pg_dump must be >= the server's major version,
# and Debian's default client lags. MariaDB client provides `mysql` + `mysqldump`
# (wire-compatible with MySQL). pgloader handles the cross-engine -> Postgres path.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      postgresql-client-17 \
      mariadb-client \
      sqlite3 \
      pgloader \
 && apt-get purge -y curl gnupg \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# The container is kept alive and exec'd into by migrateus; this is a fallback.
CMD ["sleep", "infinity"]
