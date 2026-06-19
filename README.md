# Migrateus

<img src="./migrateus.jpg" width="300">

Schema Migrations and DB Back-up and Restore for Directus running on Kubernetes or Docker.

## Installation

Install as a global package with

```bash
npm install -g @neoskop/migrateus
```

or run via `npx`

```bash
npx --package=@neoskop/migrateus migrateus
```

## Usage

### Configuration

Migrateus needs you to describe the different environments in a YAML config file.
For that, create a `migrateus.yaml` file in the current directory. For example:

```yml
schemaDiff:
  ignore:
    foo:
      - bar # Ignore field `bar` of collection `foo`
    baz: true # Ignore collection `baz`
environments:
  - name: local
    platform: docker
    containerName: directus
    assetStorage: local
    settings:
      project_title: foobar
      project_descriptor: local
    credentials:
      - email: devops@neoskop.de
        token: foo
        password: bar
  - name: dev
    platform: k8s
    namespace: directus
    context: foo-dev
  - name: live
    platform: k8s
    namespace: directus
    context: foo-live
    doubleCheck: true
```

Under the key `schemaDiff` you can specify which fields or collections to `ignore` during schema diffs.

An environment under the key `environments` takes the following options:

| Name          | Type                                    | Description                                        |
| ------------- | --------------------------------------- | -------------------------------------------------- |
| `name`        | `string`                                | The name used on the command-line or in selections |
| `platform`    | `"docker" \| "k8s" \| "docker-compose" \| "aca"` | The platform type of the environment      |
| `credentials` | `object[]`                              | Credentials to enforce during restore              |
| `doubleCheck` | `boolean`                               | Whether to ask before restores / schema diffs      |
| `settings`    | `object`                                | Specify Directus [project settings][2]             |
| `assetStorage`| `string`                                | Remap restored `directus_files.storage` to this storage location before uploading assets |

Depending on the `platform` the following options are furthermore available:

#### Kubernetes config

| Name          | Type      | Default                 | Description                               |
| ------------- | --------- | ----------------------- | ----------------------------------------- |
| `context?`    | `string`  | _the current one_       | The context name in your [kubeconfig][1]  |
| `namespace?`  | `string`  | `directus`              | The namespace where Directus is installed |
| `kubeconfig?` | `string`  | _selected by `kubectl`_ | Path to the kubeconfig file               |
| `kubelogin?`  | `boolean` | `false`                 | Whether login via kubelogin is necesary   |

#### Docker config

When `platform` is set to `docker`, the following options are available:

| Name            | Type     | Description                             |
| --------------- | -------- | --------------------------------------- |
| `containerName` | `string` | The full name of the Directus container |
| `host?`         | `string` | Talk to a **remote Docker daemon over SSH** (e.g. `ssh://deploy@host`). When set, `DOCKER_HOST` is applied to every docker command, so the same code targets a remote host transparently. Covers Dokploy, Coolify, or any remote `dockerd`. |
| `service?`      | `string` | On Docker **Swarm** (e.g. Dokploy), the service name whose running task container should be resolved instead of a fixed `containerName`. |

> [!NOTE]
> With `host`, only the Docker **daemon** is reached over SSH. Directus HTTP access (asset transfer, version checks, schema diff) still targets `localhost:8055`, so you must tunnel that port yourself (e.g. `ssh -L 8055:directus:8055 …`) until native tunneling lands. On multi-node Swarm, `exec`/`cp` only reach containers on the daemon's own node — fine for the common single-node Dokploy install.

#### Docker compose config

When `platform` is set to `docker-compose`, the following options are required:

| Name          | Type     | Default              | Description                                        |
| ------------- | -------- | -------------------- | -------------------------------------------------- |
| `serviceName` | `string` | `directus`           | The name of the service in the docker-compose file |
| `composeFile` | `string` | `docker-compose.yml` | The path to the docker-compose file                |

`docker-compose` also accepts the `host?` option for a remote daemon over SSH (same semantics as the Docker config above).

#### Azure Container Apps (ACA) config

> [!WARNING]
> The ACA platform is **experimental**. The `az containerapp` command shapes, `exec` stdout capture, file transfer, and Directus HTTP reachability are not yet verified against a live Azure environment.

When `platform` is set to `aca`, the following options are required under an `aca` key. The [`az` CLI][3] must be installed and authenticated.

| Name                 | Type     | Description                                                                 |
| -------------------- | -------- | --------------------------------------------------------------------------- |
| `aca.subscription`   | `string` | Azure subscription ID                                                       |
| `aca.resourceGroup`  | `string` | Resource group containing the Directus Container App                        |
| `aca.environment`    | `string` | The ACA managed environment — the throwaway migrateus sidecar joins it (shared VNet) so it can reach the database |
| `aca.app`            | `string` | The Directus Container App name                                             |
| `aca.filesShare?`    | `string` | Azure Files share used to transfer large artifacts (e.g. a SQLite file)     |

### Database engines & cross-engine migration

Migrateus detects the database engine from the Directus container's environment — `DB_CLIENT` (`mysql`, `pg`, or `sqlite3`) and, for SQLite, `DB_FILENAME`. No engine option is needed in `migrateus.yaml`; it is read at runtime.

`backup-db` always produces an **engine-agnostic artifact** (its manifest records the source engine), so a single backup can be restored to any supported target. `restore-db` then picks the path:

- **Same engine** (e.g. Postgres → Postgres between two ACAs) — native dump/restore (`mysqldump`/`pg_dump`/SQLite file copy).
- **Cross-engine to Postgres** (e.g. SQLite → Postgres) — conversion via [pgloader][4], including the `directus_*` tables (users, roles, policies, settings).

> [!NOTE]
> Cross-engine transfer only targets **PostgreSQL** (pgloader's limitation). `MySQL → Postgres` is not yet supported (pgloader cannot read a `mysqldump` file). The SQLite→Postgres pgloader cast rules are tuned for the Directus schema but should be validated against your data.

#### The migrateus sidecar image

> [!NOTE]
> The sidecar runs only for **server** databases (MySQL/PostgreSQL). For **SQLite**, Migrateus copies the DB file (and local-storage uploads) directly to/from the Directus container — no sidecar. See [docs/architecture.md](docs/architecture.md) for the full mental model.

For server databases, Migrateus launches a short-lived sidecar next to the database and runs the engine's CLI tools in it. Cross-engine restore needs `pgloader` **and** the target client in that image, so use the bundled image which ships `mysql`/`mysqldump`, `psql`/`pg_dump`, `sqlite3`, and `pgloader`:

```bash
migrateus restore-db --image neoskop/migrateus:latest ./backup.tgz dokploy-prod
```

The default image is `neoskop/migrateus` (override per-run with `--image`). See [Sidecar image](docs/sidecar-image.md) for how it is built and published.

### Example: SQLite on Dokploy → PostgreSQL on ACA

```yml
environments:
  - name: dokploy-prod            # source: Directus + SQLite on a remote Dokploy host
    platform: docker
    host: ssh://deploy@dokploy.example.com
    service: directus             # resolved to the running Swarm task container
                                  # engine auto-detected: DB_CLIENT=sqlite3, DB_FILENAME=/directus/database/data.db

  - name: aca-prod                # target: Directus + PostgreSQL on Azure Container Apps
    platform: aca
    assetStorage: local
    aca:
      subscription: ${AZ_SUBSCRIPTION}
      resourceGroup: rg-directus
      environment: cae-directus
      app: directus
                                  # engine auto-detected: DB_CLIENT=pg
```

```bash
# back up the SQLite instance, then restore (converting to PostgreSQL via pgloader)
migrateus backup-db dokploy-prod ./prod.tgz
migrateus restore-db ./prod.tgz aca-prod
```

To subsitute the variables in the config file and specifically in the credentials section, you can create a `.env` file - i.e.:

```dotenv
TOKEN=foo
PASSWORD=bar
```

if you want to put `.env` under version control, you can also use 1Password references like so:

```dotenv
TOKEN=op://<vault>/<item>/<key>
PASSWORD=op:///<vault>/<item>/<key>
```

The tool will in that case ask whether to inject these credentials and also asks for the password to your vault in case `eval $(op signin)` was not executed
in the terminal beforehand.

> [!TIP]
> You can customize the path to the config file with the `--config <path> | -c <path>` flag and to the .env file with the `--env <path> | -e <path>` flag

### Schema Diff

To compare schema and apply schema changes interactively run the following command:

```bash
$ migrateus schema-diff [options] <from> <to>
```

Where `from` is the `name` of the environment to compare and `to` is the `name` of the environment to apply changes to.

If you don't specify either of those options, Migrateus will ask you for them.

> [!WARNING]
> To successfully perform a schema diff both Directus instances should have the same version. Therefore, Migrateus will exit with an error if they don't.

### Migrate Data

To partially migrate data on the database level between two Directus instances, run the following command:

```bash
$ migrateus migrate-data [options] <from> <to>
```

Where `from` is the `name` of the environment to migrate from and `to` is the `name` of the environment to migrate to.

If you don't specify either of those options, Migrateus will ask you for them.

Afterwards you will be asked which database tables to migrate.

> [!WARNING]
> Since the data migration is done by dumping the tables and re-importing them, you must ensure that the schema of those collections is setup correctly e.g. via the `schema-diff` command.

### Backup DB

To create a full local backup of the database, run the following command:

```bash
$ migrateus backup-db [options] <from> <to>
```

Where `from` is the `name` of the environment to back-up and `to` is the path to the backup tgz file.

If assets should not be backed up, use the `--no-assets | -n` flag.

If you don't specify either of those options, Migrateus will ask you for them resp. suggest values.

### Restore DB

To restort a database from a full local backup, run the following command:

```bash
$ migrateus restore-db [options] <from> <to>
```

Where `from` is the path to the backup tgz file to restore and `to` is the `name` of the environment to restore to.

If you restore a backup created on an instance with a different Directus storage location (for example `s3`) to an environment that only has `local`, set `assetStorage: local` on the target environment. Migrateus will remap `directus_files.storage` before re-uploading the assets.

If you don't specify either of those options, Migrateus will ask you for them.

### Logical vs physical backup

Migrateus supports two backup formats, selected at backup time. `restore-db` auto-detects the format from the backup's metadata.

#### Physical backup (default)

`backup-db` without any extra flags produces a **physical** backup: a DB-native dump (`mysqldump`/`pg_dump`) or, for SQLite, a direct file copy. This is the fastest option and is suitable for **same-DBMS** restores.

Attempting a cross-DBMS restore from a physical backup (e.g. restoring a `pg_dump` into MySQL) will fail with an error that tells you to use a logical backup instead.

#### Logical backup (`-l` / `--logical`)

```bash
migrateus backup-db -l <from> <to>
```

`backup-db -l` produces a **logical** backup via the Directus API: a schema snapshot plus per-collection item exports plus assets. The resulting archive gets a `-logical` suffix by default (e.g. `migrateus-prod-2026-06-19-logical.tgz`).

Logical backups are **engine-agnostic** and are required for **cross-DBMS** migrations (e.g. SQLite → PostgreSQL). They carry: the schema snapshot, all user-collection data, core system collections (`directus_users`, `directus_roles`, `directus_policies`, `directus_permissions`, `directus_access`, `directus_settings`), and all file assets.

> [!WARNING]
> **Limitations of logical backup/restore (v1):**
>
> - **User passwords are NOT migrated.** The Directus API masks password hashes — affected users must reset their password or authenticate via SSO after restore.
> - **Restore into a freshly-bootstrapped Directus.** Existing system rows (roles, users, etc.) in the target are not pre-deleted before import, so restoring into a non-empty Directus may cause conflicts.
> - **Scope is limited to v1 collections.** Flows, operations, dashboards, panels, presets, translations, and webhooks are not yet carried by the logical backup.

`restore-db` emits a warning at the start of every logical restore to remind you of these constraints.

### Clean

To clean up resources (Directus users and roles and containers/pods) created by Migrateus, run the following command:

```bash
$ migrateus clean [options] <env-name>
```

> [!TIP]
> You can pass `all` as the environment name to clean up all environments.

### Help

For more information on any command, run `migrateus <command> --help`

## Completions

```bash
$ echo "source <(migrateus completion-script)" >> ~/.bashrc
```

## Development

To work on Migrateus locally and run your changes as the `migrateus` CLI without publishing to npm, link the package globally with pnpm:

```bash
pnpm install
pnpm build
pnpm link --global .
```

> [!NOTE]
> Since pnpm 11 the directory argument is required — pass `.` for the current package. The first time you use pnpm's global bin, run `pnpm setup` once and open a new shell so `PNPM_HOME` is on `PATH`.

If you previously installed Migrateus globally via npm, remove that version first so the linked binary wins:

```bash
npm uninstall -g @neoskop/migrateus
```

Verify the linked binary points at your working copy:

```bash
which migrateus
# → ~/.local/share/pnpm/bin/migrateus
grep cmd-shim-target $(which migrateus)
# → # cmd-shim-target=<repo>/dist/src/main.js
```

The `bin` entry resolves to `dist/src/main.js`, so rebuild after every change. The recommended workflow is to keep a watcher running in a second terminal:

```bash
pnpm watch
```

## Changelog

See [Changelog](CHANGELOG.md).

## License

See [License](LICENSE).

[1]: https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/
[2]: https://docs.directus.io/reference/system/settings.html#the-settings-object
[3]: https://learn.microsoft.com/cli/azure/install-azure-cli
[4]: https://pgloader.io
