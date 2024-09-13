# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2024-09-13

### 🚀 Features

- *(k8s)* Check kubelogin installation

## [1.1.0] - 2024-09-13

### 🚀 Features

- Add `docker-compose` as `platform` to find Directus container more easily / consistently

### 🐛 Bug Fixes

- *(deps)* Update dependency argon2 to v0.41.1

### ⚙️ Miscellaneous Tasks

- Update deps

## [1.0.1] - 2024-09-11

### 🐛 Bug Fixes

- *(deps)* Update dependency @directus/sdk to v17
- *(deps)* Update dependency ora to v8.1.0
- *(deps)* Update dependency @inquirer/expand to v2.2.0
- *(deps)* Update dependency @inquirer/password to v2.2.0
- *(deps)* Update dependency @inquirer/confirm to v3.2.0
- *(deps)* Update dependency @inquirer/select to v2.5.0
- *(deps)* Update dependency @directus/sdk to v17.0.1
- *(deps)* Update dependency @inquirer/expand to v2.3.0
- *(deps)* Update dependency file-type to v19.5.0

## [1.0.0] - 2024-08-22

### 🚀 Features

- Adjust user creation to new Directus schema in 11.x.x

### 🐛 Bug Fixes

- *(deps)* Update dependency file-type to v19.4.1
- *(deps)* Update dependency winston to v3.14.2
- *(deps)* Update dependency nest-commander to v3.15.0

### 📚 Documentation

- *(README)* Don't add completion script statically to bashrc

## [0.15.0] - 2024-08-14

### 🚀 Features

- *(restore)* Add force flag to prevent version checks
- *(restore-db)* Sort backups and show age

### 🐛 Bug Fixes

- *(deps)* Update dependency file-type to v19.4.0
- *(deps)* Update dependency @inquirer/confirm to v3.1.21
- *(deps)* Update dependency @inquirer/expand to v2.1.21
- *(deps)* Update dependency @inquirer/password to v2.1.21
- *(deps)* Update dependency @inquirer/select to v2.4.6
- *(deps)* Update dependency @inquirer/confirm to v3.1.22
- *(deps)* Update dependency @inquirer/expand to v2.1.22
- *(deps)* Update dependency @inquirer/password to v2.1.22
- *(deps)* Update dependency @inquirer/select to v2.4.7
- *(deps)* Update dependency @directus/sdk to v16.1.2
- *(deps)* Update dependency winston to v3.14.0
- *(deps)* Update dependency winston to v3.14.1
- *(deps)* Update nest monorepo to v10.4.0
- *(deps)* Update nest monorepo to v10.4.1
- *(schema-diff)* Fix clean up when setup partially failed

### 📚 Documentation

- Update TODO.md

## [0.14.1] - 2024-08-01

### 🐛 Bug Fixes

- *(k8s)* Add namespace flag correctly and only if set in config

## [0.14.0] - 2024-08-01

### 🚀 Features

- *(k8s)* Substitute dotenv in kubeconfig

### 🐛 Bug Fixes

- *(deps)* Update dependency @inquirer/confirm to v3.1.19
- *(deps)* Update dependency @inquirer/expand to v2.1.19
- *(deps)* Update dependency @inquirer/password to v2.1.19
- *(deps)* Update dependency @inquirer/select to v2.4.4
- *(deps)* Update dependency @inquirer/confirm to v3.1.20
- *(deps)* Update dependency @inquirer/expand to v2.1.20
- *(deps)* Update dependency @inquirer/password to v2.1.20
- *(deps)* Update dependency @inquirer/select to v2.4.5

## [0.13.0] - 2024-07-29

### 🚀 Features

- Wait until Directus is up and running after starting it locally

### 🐛 Bug Fixes

- *(deps)* Update dependency @inquirer/confirm to v3.1.18
- *(deps)* Update dependency @inquirer/expand to v2.1.18
- *(deps)* Update dependency @inquirer/password to v2.1.18
- *(deps)* Update dependency @inquirer/select to v2.4.3

## [0.12.0] - 2024-07-26

### 🚀 Features

- Enable kubelogin

### 🐛 Bug Fixes

- Fix usage of kubeconfig option

## [0.11.0] - 2024-07-25

### 🚀 Features

- *(clean)* Allow cleaning of all environments sequentially
- Add support for kubeconfig file specification per environment

### 🐛 Bug Fixes

- Fix error logging when verbose output is on

### 📚 Documentation

- *(README)* Add documentation for clean command

## [0.10.0] - 2024-07-23

### 🚀 Features

- Compare server version during restore

### 🐛 Bug Fixes

- *(deps)* Update dependency @inquirer/confirm to v3.1.16
- *(deps)* Update dependency @inquirer/expand to v2.1.16
- *(deps)* Update dependency @inquirer/password to v2.1.16
- *(deps)* Update dependency @inquirer/select to v2.4.1
- *(deps)* Update dependency @inquirer/confirm to v3.1.17
- *(deps)* Update dependency @inquirer/expand to v2.1.17
- *(deps)* Update dependency @inquirer/password to v2.1.17
- *(deps)* Update dependency @inquirer/select to v2.4.2
- *(deps)* Update dependency file-type to v19.3.0

### 📚 Documentation

- *(TODO)* Add task
- *(TODO)* Add tasks

## [0.9.0] - 2024-07-19

### 🚀 Features

- Check for new versions on start

### ⚙️ Miscellaneous Tasks

- Update deps

## [0.8.0] - 2024-07-19

### 🚀 Features

- Inject from dotenv templates to .env file and automatically git ignore file if needed

### 🐛 Bug Fixes

- *(clean)* Fix environment question phrasing

### ⚙️ Miscellaneous Tasks

- Add missing typing for js-yaml

## [0.7.0] - 2024-07-18

### 🚀 Features

- Handle multiple 1password accounts

### 🐛 Bug Fixes

- *(deps)* Update dependency file-type to v19.2.0
- Fix 1password login

### 📚 Documentation

- *(README)* Update for `op` support in `.env`

## [0.6.0] - 2024-07-17

### 🚀 Features

- Add automatic 1Password injection with .env file

### ⚙️ Miscellaneous Tasks

- *(git-cliff)* Filter duplicate commits

## [0.5.1] - 2024-07-17

### 🐛 Bug Fixes

- *(deps)* Update dependency @inquirer/confirm to v3.1.15
- *(deps)* Update dependency @inquirer/expand to v2.1.15
- *(deps)* Update dependency semver to v7.6.3

### 📚 Documentation

- *(README)* Change `type` to `platform`

## [0.5.0] - 2024-07-16

### 🚀 Features

- *(restore-db)* Allow overriding of project settings after restore
- *(restore-db)* Restart Directus instances after restore for more consistency
- Add better debug logs for Directus SDK calls and restoring of assets

### 🐛 Bug Fixes

- *(restore-db)* Fix concurrency issue with collation harmonization
- *(logging)* Handle non-string arguments correctly
- *(restore-db)* Fix failure display in restores without `-v` flag
- *(restore-db)* Better logs when running without `-v` flag

### 📚 Documentation

- *(README)* Add `doubleCheck` to example YAML
- *(TODO)* Add task for checking versions when backing up the db

### ⚙️ Miscellaneous Tasks

- Update `git cliff` settings for more brevity in the changelog

## [0.4.0] - 2024-07-15

### 🚀 Features

- *(schema-diff)* Compare server version before attempting a schema diff

### 📚 Documentation

- *(TODO)* Add new tasks for even more polishing 🫠

## [0.3.0] - 2024-07-15

### 🚀 Features

- Allow overriding of container docker image via `-i | --image`

### 🐛 Bug Fixes

- *(restore-db)* Fix being stuck in clean-up

### 📚 Documentation

- *(TODO)* Add entry for kubelogin quality-of-life feature

## [0.2.0] - 2024-07-15

### 🚀 Features

- Add `doubleCheck` flag for critical environments

### 🐛 Bug Fixes

- *(schema-diff)* Fix schema diff by awaiting necessary statements

## [0.1.0] - 2024-07-15

### 🚀 Features

- Add ora as a nicer way to display progress when running without verbose flag

## [0.0.5] - 2024-07-15

### 🚀 Features

- Add jscpd for duplicate code detection
- Use better logging for clean up ops
- Add git cliff for changelogs

### 🐛 Bug Fixes

- *(deps)* Update dependency file-type to v19.1.1
- *(deps)* Update dependency winston to v3.13.1

### 📚 Documentation

- Update TODO.md

## [0.0.4] - 2024-07-10

### 🚀 Features

- Check dependencies

<!-- generated by git-cliff -->
