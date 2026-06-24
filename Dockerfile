# Bundled sidecar image for migrateus.
#
# Migrateus launches a short-lived sidecar next to the database and runs the
# engine's CLI tools inside it. This image carries the native CLI clients for
# every supported engine: mysql/mysqldump (MariaDB client), psql/pg_dump
# (PostgreSQL 17 client), and sqlite3. Cross-DBMS restore is handled via
# logical backup/restore (-l flag); pgloader is no longer bundled.
#
# Published as `neoskop/migrateus` (see .github/workflows/sidecar-image.yml and
# docs/sidecar-image.md). The CLI defaults to this image and accepts `--image`
# to override (e.g. to pin a version or pg_dump major).
FROM debian:bookworm-slim@sha256:60eac759739651111db372c07be67863818726f754804b8707c90979bda511df

ENV DEBIAN_FRONTEND=noninteractive

# PostgreSQL client 17 from PGDG: pg_dump must be >= the server's major version,
# and Debian's default client lags. MariaDB client provides `mysql` + `mysqldump`
# (wire-compatible with MySQL). Cross-DBMS transfers go through logical
# backup/restore (-l flag) so no pgloader is needed.
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
 && apt-get purge -y curl gnupg \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# Run as a non-root user. The docker platform overrides this at runtime with the
# host user (`--user $uid:$gid`); k8s/ACA use this image default. A numeric UID
# keeps it compatible with Kubernetes `runAsNonRoot`. /tmp (1777) and the bind-
# mounted backup dir (created mode 0777) stay writable for any UID.
RUN groupadd -g 1000 migrateus \
 && useradd -m -u 1000 -g 1000 -s /bin/bash migrateus
ENV HOME=/home/migrateus
USER 1000

# The container is kept alive and exec'd into by migrateus; this is a fallback.
CMD ["sleep", "infinity"]
