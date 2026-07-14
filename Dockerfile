# Bundled sidecar image for migrateus.
#
# Migrateus launches a short-lived sidecar next to the database and runs the
# engine's CLI tools inside it. This image carries the native CLI clients for
# every supported engine: mysql/mysqldump (Oracle MySQL client), psql/pg_dump
# (PostgreSQL 17 client), and sqlite3. Cross-DBMS restore is handled via
# logical backup/restore (-l flag); pgloader is no longer bundled.
#
# Published as `neoskop/migrateus` (see .github/workflows/sidecar-image.yml and
# docs/sidecar-image.md). The CLI defaults to this image and accepts `--image`
# to override (e.g. to pin a version or pg_dump major).
FROM debian:bookworm-slim@sha256:7b140f374b289a7c2befc338f42ebe6441b7ea838a042bbd5acbfca6ec875818

ENV DEBIAN_FRONTEND=noninteractive

# PostgreSQL client 17 from PGDG: pg_dump must be >= the server's major version,
# and Debian's default client lags. The MySQL client is Percona's
# `percona-server-client` (8.4 LTS), NOT Debian's `mariadb-client`: MariaDB's
# mysqldump rejects Oracle-MySQL options such as `--set-gtid-purged` that
# migrateus relies on, so a real MySQL client is required to dump MySQL/Percona
# servers. Percona's repo is used over Oracle's MySQL APT repo because the latter
# ships an already-expired signing key; Percona also matches the PXC servers we
# target and provides amd64 + arm64. Cross-DBMS transfers go through logical
# backup/restore (-l flag) so no pgloader is needed.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && curl -fsSL https://repo.percona.com/apt/percona-release_latest.generic_all.deb \
      -o /tmp/percona-release.deb \
 && apt-get install -y --no-install-recommends /tmp/percona-release.deb \
 && percona-release setup -y ps-84-lts \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      postgresql-client-17 \
      percona-server-client \
      sqlite3 \
 && apt-get purge -y curl gnupg lsb-release percona-release \
 && apt-get autoremove -y \
 && rm -rf /tmp/percona-release.deb /var/lib/apt/lists/*

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
