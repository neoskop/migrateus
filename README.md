# Migrateus

<img src="./migrateus.jpg" width="300">

Schema Migrations and DB Back-up and Restore for Directus running on Kubernetes or Docker.

## Installation

Install as a global package with

```bash
npm install -g migrateus
```

or run via `npx`

```bash
npx migrateus
```

## Usage

### Configuration

Migrateus needs you to describe the different environments in a YAML config file.
For that, create a `migrateus.yaml` file in the current directory. For example:

```yml
environments:
  - name: local
    type: docker
    containerName: directus
    credentials:
      - email: devops@neoskop.de
        token: foo
        password: bar
  - name: dev
    type: k8s
    namespace: directus
    context: foo-dev
```

An environment takes the following options:

| Name            | Type                | Description                                                   |
| --------------- | ------------------- | ------------------------------------------------------------- |
| `name`          | `string`            | The name used on the command-line or in selections            |
| `type`          | `"docker" \| "k8s"` | The platform type of the environment                          |
| `containerName` | `string`            | Only if `type=docker`, The name of the Directus container     |
| `context`       | `string`            | Only if `type=k8s`, the context name in your [kubeconfig][1]  |
| `namespace`     | `string`            | Only if `type=k8s`, the namespace where Directus is installed |
| `credentials`   | `object[]`          | Credentials to enforce during restore                         |

To subsitute the variables in the config file and specifically in the credentials section, you can create a `.env` file - i.e.:

```dotenv
TOKEN=foo
PASSWORD=bar
```

> [!TIP]
> You can customize the path to the config file with the `-c <path>` flag and to the .env file with the `-e <path>` flag

### Schema Diff

1. Run the `migrateus schema-diff` command
2. Confirm the schema diff
3. The tool will create a backup of the current schema and save it in the `migrations` directory

### Backup DB

1. Run the `migrateus backup-db` command
2. Confirm the backup location
3. The tool will create a backup of the database and save it in the specified location

### Restore DB

1. Run the `migrateus restore-db` command
2. Select the backup to restore
3. The tool will restore the database from the selected backup

### Help

For more information on any command, run `migrateus <command> --help`

## Completions

```bash
$ migrateus completion-script >> ~/.bashrc
```

## License

See [License](LICENSE).

[1]: https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/
