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
| `platform`    | `"docker" \| "k8s" \| "docker-compose"` | The platform type of the environment               |
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

When `platform` is set to `docker`, the following options are required:

| Name            | Type     | Description                             |
| --------------- | -------- | --------------------------------------- |
| `containerName` | `string` | The full name of the Directus container |

#### Docker compose config

When `platform` is set to `docker-compose`, the following options are required:

| Name          | Type     | Default              | Description                                        |
| ------------- | -------- | -------------------- | -------------------------------------------------- |
| `serviceName` | `string` | `directus`           | The name of the service in the docker-compose file |
| `composeFile` | `string` | `docker-compose.yml` | The path to the docker-compose file                |

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

## Changelog

See [Changelog](CHANGELOG.md).

## License

See [License](LICENSE).

[1]: https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/
[2]: https://docs.directus.io/reference/system/settings.html#the-settings-object
