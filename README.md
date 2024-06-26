# Migrateus

Schema Migrations and DB Back-up and Restore for Directus

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

Create a `migrateus.yaml` file in the current directory. For example:

```yaml
environments:
  - name: local
    type: docker
    containerName: directus
  - name: dev
    type: k8s
    namespace: directus
    context: foo-dev
```

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
