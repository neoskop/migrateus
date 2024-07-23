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
environments:
  - name: local
    platform: docker
    containerName: directus
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

An environment takes the following options:

| Name            | Type                | Description                                                   |
| --------------- | ------------------- | ------------------------------------------------------------- |
| `name`          | `string`            | The name used on the command-line or in selections            |
| `platform`      | `"docker" \| "k8s"` | The platform type of the environment                          |
| `containerName` | `string`            | Only if `type=docker`, The name of the Directus container     |
| `context`       | `string`            | Only if `type=k8s`, the context name in your [kubeconfig][1]  |
| `namespace`     | `string`            | Only if `type=k8s`, the namespace where Directus is installed |
| `kubeconfig`    | `string`            | Only if `type=k8s`, path to the kubeconfig file               |
| `credentials`   | `object[]`          | Credentials to enforce during restore                         |
| `doubleCheck`   | `boolean`           | Whether to ask before restores / schema diffs                 |
| `settings`      | `object`            | Specify Directus [project settings][2]                        |

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

### Backup DB

To create a local backup of the database, run the following command:

```bash
$ migrateus backup-db [options] <from> <to>
```

Where `from` is the `name` of the environment to back-up and `to` is the path to the backup tgz file.

If assets should not be backed up, use the `--no-assets | -n` flag.

If you don't specify either of those options, Migrateus will ask you for them resp. suggest values.

### Restore DB

To restort a database from a local backup, run the following command:

```bash
$ migrateus restore-db [options] <from> <to>
```

Where `from` is the path to the backup tgz file to restore and `to` is the `name` of the environment to restore to.

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
$ migrateus completion-script >> ~/.bashrc
```

## Changelog

See [Changelog](CHANGELOG.md).

## License

See [License](LICENSE).

[1]: https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/
[2]: https://docs.directus.io/reference/system/settings.html#the-settings-object
