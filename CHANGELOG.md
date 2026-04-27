# Changelog

All notable changes to this project will be documented in this file.

## [2.6.0] - 2026-04-27

### 🚀 Features

- Add assetStorage option to remap storage location during restore

### 🐛 Bug Fixes

- *(deps)* Update dependency @nestjs/core to v11.1.18 [security] ([#895](https://github.com/neoskop/migrateus/issues/895))
- *(deps)* Update dependency @directus/sdk to v21.2.2 ([#899](https://github.com/neoskop/migrateus/issues/899))
- *(deps)* Update dependency @inquirer/confirm to v6.0.11 ([#900](https://github.com/neoskop/migrateus/issues/900))
- *(deps)* Update dependency @inquirer/core to v11.1.8 ([#901](https://github.com/neoskop/migrateus/issues/901))
- *(deps)* Update dependency @inquirer/expand to v5.0.11 ([#902](https://github.com/neoskop/migrateus/issues/902))
- *(deps)* Update dependency @inquirer/figures to v2.0.5 ([#903](https://github.com/neoskop/migrateus/issues/903))
- *(deps)* Update dependency @inquirer/password to v5.0.11 ([#904](https://github.com/neoskop/migrateus/issues/904))
- *(deps)* Update dependency @inquirer/select to v5.1.3 ([#905](https://github.com/neoskop/migrateus/issues/905))
- *(deps)* Update dependency @inquirer/type to v4.0.5 ([#906](https://github.com/neoskop/migrateus/issues/906))
- *(deps)* Update nest monorepo ([#907](https://github.com/neoskop/migrateus/issues/907))
- *(deps)* Update dependency dotenv to v17.4.1 ([#909](https://github.com/neoskop/migrateus/issues/909))
- *(deps)* Update dependency @inquirer/expand to v5.0.12 ([#910](https://github.com/neoskop/migrateus/issues/910))
- *(deps)* Update dependency dotenv to v17.4.2 ([#921](https://github.com/neoskop/migrateus/issues/921))
- *(deps)* Update nest monorepo to v11.1.19 ([#922](https://github.com/neoskop/migrateus/issues/922))
- *(deps)* Update dependency nanoid to v5.1.9 ([#926](https://github.com/neoskop/migrateus/issues/926))
- *(deps)* Update dependency @inquirer/confirm to v6.0.12 ([#931](https://github.com/neoskop/migrateus/issues/931))
- *(deps)* Update dependency @inquirer/core to v11.1.9 ([#932](https://github.com/neoskop/migrateus/issues/932))
- *(deps)* Update dependency @inquirer/expand to v5.0.13 ([#934](https://github.com/neoskop/migrateus/issues/934))
- *(deps)* Update dependency @inquirer/password to v5.0.12 ([#935](https://github.com/neoskop/migrateus/issues/935))
- *(deps)* Update dependency @inquirer/select to v5.1.4 ([#936](https://github.com/neoskop/migrateus/issues/936))
- *(deps)* Update dependency uuid to v14 [security]
- *(deps)* Update dependency file-type to v22
- *(deps)* Update dependency ora to v9.4.0 ([#938](https://github.com/neoskop/migrateus/issues/938))

## [2.5.6] - 2026-03-31

### ⚙️ Miscellaneous Tasks

- Install latest npm globally before version bump in release workflow

## [2.5.5] - 2026-03-31

### ⚙️ Miscellaneous Tasks

- Add pnpm-workspace.yaml with minimum release age
- Replace local release script with GitHub Actions workflow
- Enable npm provenance with OIDC token publishing
- Pin packageManager field to pnpm@10.33.0
- Change npm publish access from restricted to public
- Switch npm publish from pnpm to npm in release workflow
- Add repository field to package.json

## [2.5.4] - 2026-03-27

### 🐛 Bug Fixes

- Fix errors after TypeScript 6 migration

## [2.5.3] - 2026-03-27

### 🚀 Features

- *(k8s)* Support secretRef in envFrom and cache secret lookups

### 🐛 Bug Fixes

- *(deps)* Update dependency @inquirer/confirm to v6.0.9 ([#852](https://github.com/neoskop/migrateus/issues/852))
- *(deps)* Update dependency @inquirer/core to v11.1.6 ([#853](https://github.com/neoskop/migrateus/issues/853))
- *(deps)* Update dependency @inquirer/confirm to v6.0.10 ([#854](https://github.com/neoskop/migrateus/issues/854))
- *(deps)* Update dependency @inquirer/core to v11.1.7 ([#855](https://github.com/neoskop/migrateus/issues/855))
- *(deps)* Update dependency @inquirer/expand to v5.0.10 ([#856](https://github.com/neoskop/migrateus/issues/856))
- *(deps)* Update dependency @inquirer/figures to v2.0.4 ([#857](https://github.com/neoskop/migrateus/issues/857))
- *(deps)* Update dependency @inquirer/password to v5.0.10 ([#858](https://github.com/neoskop/migrateus/issues/858))
- *(deps)* Update dependency @inquirer/select to v5.1.2 ([#859](https://github.com/neoskop/migrateus/issues/859))
- *(deps)* Update dependency @inquirer/type to v4.0.4 ([#861](https://github.com/neoskop/migrateus/issues/861))
- *(deps)* Update dependency nanoid to v5.1.7 ([#862](https://github.com/neoskop/migrateus/issues/862))
- *(deps)* Update dependency file-type to v21.3.3 ([#864](https://github.com/neoskop/migrateus/issues/864))
- *(deps)* Update dependency file-type to v21.3.4 ([#865](https://github.com/neoskop/migrateus/issues/865))
- *(deps)* Update dependency @directus/sdk to v21.2.1 ([#869](https://github.com/neoskop/migrateus/issues/869))

## [2.5.2] - 2026-03-14

### 🐛 Bug Fixes

- *(deps)* Update dependency semver to v7.7.4 ([#797](https://github.com/neoskop/migrateus/issues/797))
- *(deps)* Update dependency @directus/sdk to v21.1.0 ([#798](https://github.com/neoskop/migrateus/issues/798))
- *(deps)* Update dependency dotenv to v17.2.4 ([#799](https://github.com/neoskop/migrateus/issues/799))
- *(deps)* Update dependency glob to v13.0.2 ([#805](https://github.com/neoskop/migrateus/issues/805))
- *(deps)* Update dependency which to v6.0.1 ([#806](https://github.com/neoskop/migrateus/issues/806))
- *(deps)* Update dependency glob to v13.0.3 ([#807](https://github.com/neoskop/migrateus/issues/807))
- *(deps)* Update dependency dotenv to v17.3.0 ([#808](https://github.com/neoskop/migrateus/issues/808))
- *(deps)* Update dependency dotenv to v17.3.1 ([#809](https://github.com/neoskop/migrateus/issues/809))
- *(deps)* Update dependency @inquirer/confirm to v6.0.6 ([#810](https://github.com/neoskop/migrateus/issues/810))
- *(deps)* Update dependency @inquirer/core to v11.1.3 ([#811](https://github.com/neoskop/migrateus/issues/811))
- *(deps)* Update dependency @inquirer/expand to v5.0.6 ([#812](https://github.com/neoskop/migrateus/issues/812))
- *(deps)* Update dependency @inquirer/password to v5.0.6 ([#813](https://github.com/neoskop/migrateus/issues/813))
- *(deps)* Update dependency @inquirer/select to v5.0.6 ([#814](https://github.com/neoskop/migrateus/issues/814))
- *(deps)* Update dependency @inquirer/confirm to v6.0.7 ([#816](https://github.com/neoskop/migrateus/issues/816))
- *(deps)* Update dependency @inquirer/core to v11.1.4 ([#817](https://github.com/neoskop/migrateus/issues/817))
- *(deps)* Update dependency @inquirer/expand to v5.0.7 ([#818](https://github.com/neoskop/migrateus/issues/818))
- *(deps)* Update dependency @inquirer/password to v5.0.7 ([#819](https://github.com/neoskop/migrateus/issues/819))
- *(deps)* Update dependency @inquirer/select to v5.0.7 ([#820](https://github.com/neoskop/migrateus/issues/820))
- *(deps)* Update dependency glob to v13.0.4 ([#821](https://github.com/neoskop/migrateus/issues/821))
- *(deps)* Update dependency glob to v13.0.5 ([#824](https://github.com/neoskop/migrateus/issues/824))
- *(deps)* Update dependency glob to v13.0.6 ([#825](https://github.com/neoskop/migrateus/issues/825))
- *(deps)* Update dependency @inquirer/confirm to v6.0.8 ([#829](https://github.com/neoskop/migrateus/issues/829))
- *(deps)* Update dependency @inquirer/core to v11.1.5 ([#830](https://github.com/neoskop/migrateus/issues/830))
- *(deps)* Update dependency @inquirer/expand to v5.0.8 ([#831](https://github.com/neoskop/migrateus/issues/831))
- *(deps)* Update dependency @inquirer/password to v5.0.8 ([#832](https://github.com/neoskop/migrateus/issues/832))
- *(deps)* Update dependency @inquirer/select to v5.1.0 ([#833](https://github.com/neoskop/migrateus/issues/833))
- *(deps)* Update dependency @directus/sdk to v21.2.0 ([#841](https://github.com/neoskop/migrateus/issues/841))
- *(deps)* Update dependency file-type to v21.3.1 ([#847](https://github.com/neoskop/migrateus/issues/847))
- Use utf8mb4 as charset for dump and restore
- *(deps)* Update dependency file-type to v21.3.2 ([#851](https://github.com/neoskop/migrateus/issues/851))

## [2.5.1] - 2026-02-05

### 🐛 Bug Fixes

- *(deps)* Update dependency @inquirer/confirm to v6.0.2 ([#726](https://github.com/neoskop/migrateus/issues/726))
- *(deps)* Update dependency @inquirer/core to v11.0.2 ([#727](https://github.com/neoskop/migrateus/issues/727))
- *(deps)* Update dependency @inquirer/expand to v5.0.2 ([#729](https://github.com/neoskop/migrateus/issues/729))
- *(deps)* Update dependency @inquirer/figures to v2.0.2 ([#730](https://github.com/neoskop/migrateus/issues/730))
- *(deps)* Update dependency @inquirer/password to v5.0.2 ([#731](https://github.com/neoskop/migrateus/issues/731))
- *(deps)* Update dependency @inquirer/select to v5.0.2 ([#732](https://github.com/neoskop/migrateus/issues/732))
- *(deps)* Update dependency @inquirer/type to v4.0.2 ([#733](https://github.com/neoskop/migrateus/issues/733))
- *(deps)* Update dependency winston to v3.19.0 ([#734](https://github.com/neoskop/migrateus/issues/734))
- *(deps)* Update dependency @directus/sdk to v20.3.0 ([#738](https://github.com/neoskop/migrateus/issues/738))
- *(deps)* Update dependency @inquirer/confirm to v6.0.3 ([#742](https://github.com/neoskop/migrateus/issues/742))
- *(deps)* Update dependency @inquirer/expand to v5.0.3 ([#743](https://github.com/neoskop/migrateus/issues/743))
- *(deps)* Update dependency @inquirer/password to v5.0.3 ([#745](https://github.com/neoskop/migrateus/issues/745))
- *(deps)* Update dependency @inquirer/select to v5.0.3 ([#746](https://github.com/neoskop/migrateus/issues/746))
- *(deps)* Update dependency @inquirer/core to v11.1.0 ([#747](https://github.com/neoskop/migrateus/issues/747))
- *(deps)* Update dependency file-type to v21.2.0 ([#755](https://github.com/neoskop/migrateus/issues/755))
- *(deps)* Update dependency file-type to v21.3.0 ([#758](https://github.com/neoskop/migrateus/issues/758))
- *(deps)* Update dependency @inquirer/confirm to v6.0.4 ([#766](https://github.com/neoskop/migrateus/issues/766))
- *(deps)* Update dependency @inquirer/core to v11.1.1 ([#767](https://github.com/neoskop/migrateus/issues/767))
- *(deps)* Update dependency @inquirer/expand to v5.0.4 ([#768](https://github.com/neoskop/migrateus/issues/768))
- *(deps)* Update dependency @inquirer/figures to v2.0.3 ([#769](https://github.com/neoskop/migrateus/issues/769))
- *(deps)* Update dependency @inquirer/password to v5.0.4 ([#770](https://github.com/neoskop/migrateus/issues/770))
- *(deps)* Update dependency @inquirer/select to v5.0.4 ([#771](https://github.com/neoskop/migrateus/issues/771))
- *(deps)* Update dependency @inquirer/type to v4.0.3 ([#772](https://github.com/neoskop/migrateus/issues/772))
- *(deps)* Update dependency ora to v9.1.0 ([#784](https://github.com/neoskop/migrateus/issues/784))
- *(deps)* Update dependency p-limit to v7.3.0 ([#792](https://github.com/neoskop/migrateus/issues/792))
- *(deps)* Update dependency glob to v13.0.1 ([#793](https://github.com/neoskop/migrateus/issues/793))
- *(deps)* Update dependency ora to v9.2.0 ([#794](https://github.com/neoskop/migrateus/issues/794))
- *(deps)* Update dependency @directus/sdk to v21
- *(deps)* Update dependency ora to v9.3.0 ([#795](https://github.com/neoskop/migrateus/issues/795))

## [2.5.0] - 2025-11-25

### 🐛 Bug Fixes

- *(deps)* Update dependency nest-commander to v3.20.0 ([#621](https://github.com/neoskop/migrateus/issues/621))
- *(deps)* Update dependency pretty-bytes to v7.1.0 ([#626](https://github.com/neoskop/migrateus/issues/626))
- *(deps)* Update dependency nanoid to v5.1.6 ([#629](https://github.com/neoskop/migrateus/issues/629))
- *(deps)* Update dependency dotenv to v17.2.3 ([#635](https://github.com/neoskop/migrateus/issues/635))
- *(deps)* Update dependency winston to v3.18.0 ([#636](https://github.com/neoskop/migrateus/issues/636))
- *(deps)* Update dependency winston to v3.18.1 ([#637](https://github.com/neoskop/migrateus/issues/637))
- *(deps)* Update dependency winston to v3.18.2 ([#638](https://github.com/neoskop/migrateus/issues/638))
- *(deps)* Update dependency winston to v3.18.3 ([#641](https://github.com/neoskop/migrateus/issues/641))
- *(deps)* Update dependency nest-commander to v3.20.1 ([#642](https://github.com/neoskop/migrateus/issues/642))
- *(deps)* Update dependency semver to v7.7.3 ([#647](https://github.com/neoskop/migrateus/issues/647))
- *(deps)* Update dependency @inquirer/confirm to v5.1.19 ([#654](https://github.com/neoskop/migrateus/issues/654))
- *(deps)* Update dependency @inquirer/expand to v4.0.21 ([#655](https://github.com/neoskop/migrateus/issues/655))
- *(deps)* Update dependency @inquirer/figures to v1.0.14 ([#656](https://github.com/neoskop/migrateus/issues/656))
- *(deps)* Update dependency @inquirer/password to v4.0.21 ([#657](https://github.com/neoskop/migrateus/issues/657))
- *(deps)* Update dependency @inquirer/type to v3.0.9 ([#658](https://github.com/neoskop/migrateus/issues/658))
- *(deps)* Update dependency @inquirer/core to v10.3.0 ([#659](https://github.com/neoskop/migrateus/issues/659))
- *(deps)* Update dependency @inquirer/select to v4.4.0 ([#660](https://github.com/neoskop/migrateus/issues/660))
- *(deps)* Update dependency p-limit to v7.2.0 ([#663](https://github.com/neoskop/migrateus/issues/663))
- *(deps)* Update dependency @directus/sdk to v20.1.1 ([#679](https://github.com/neoskop/migrateus/issues/679))
- *(deps)* Update dependency @inquirer/confirm to v5.1.20 ([#680](https://github.com/neoskop/migrateus/issues/680))
- *(deps)* Update dependency @inquirer/core to v10.3.1 ([#681](https://github.com/neoskop/migrateus/issues/681))
- *(deps)* Update dependency @inquirer/expand to v4.0.22 ([#682](https://github.com/neoskop/migrateus/issues/682))
- *(deps)* Update dependency @inquirer/figures to v1.0.15 ([#683](https://github.com/neoskop/migrateus/issues/683))
- *(deps)* Update dependency @inquirer/password to v4.0.22 ([#684](https://github.com/neoskop/migrateus/issues/684))
- *(deps)* Update dependency @inquirer/select to v4.4.1 ([#685](https://github.com/neoskop/migrateus/issues/685))
- *(deps)* Update dependency @inquirer/type to v3.0.10 ([#686](https://github.com/neoskop/migrateus/issues/686))
- *(deps)* Update dependency file-type to v21.1.0 ([#688](https://github.com/neoskop/migrateus/issues/688))
- *(deps)* Update dependency uuid to v13
- *(deps)* Update dependency ora to v9
- *(deps)* Update dependency @inquirer/confirm to v5.1.21 ([#693](https://github.com/neoskop/migrateus/issues/693))
- *(deps)* Update dependency @inquirer/core to v10.3.2 ([#694](https://github.com/neoskop/migrateus/issues/694))
- *(deps)* Update dependency @inquirer/expand to v4.0.23 ([#695](https://github.com/neoskop/migrateus/issues/695))
- *(deps)* Update dependency @inquirer/password to v4.0.23 ([#696](https://github.com/neoskop/migrateus/issues/696))
- *(deps)* Update dependency @inquirer/select to v4.4.2 ([#697](https://github.com/neoskop/migrateus/issues/697))
- *(deps)* Update dependency js-yaml to v4.1.1 ([#698](https://github.com/neoskop/migrateus/issues/698))
- *(deps)* Update dependency glob to v11.1.0 ([#708](https://github.com/neoskop/migrateus/issues/708))
- *(deps)* Update dependency file-type to v21.1.1 ([#711](https://github.com/neoskop/migrateus/issues/711))
- *(deps)* Update dependency @directus/sdk to v20.2.0 ([#712](https://github.com/neoskop/migrateus/issues/712))
- *(deps)* Update dependency which to v6
- *(deps)* Update dependency tmp to v0.2.5
- *(deps)* Update dependency glob to v13
- *(deps)* Update dependency mime-types to v3.0.2 ([#714](https://github.com/neoskop/migrateus/issues/714))
- *(schema-diff)* Fix schema-diff for Directus >= 11.13.0

### ⚙️ Miscellaneous Tasks

- Switch bitnami/mysql image out because of bitnami deprecation
- Redact env map entries
- Update deps

## [2.4.1] - 2025-09-17

### 🐛 Bug Fixes

- *(deps)* Update dependency @directus/sdk to v20.1.0 ([#619](https://github.com/neoskop/migrateus/issues/619))
- *(rename-collection)* Fix behaviour when collection has fkey constraints

## [2.4.0] - 2025-09-15

### 🚀 Features

- Add `rename-collection` command

### 🐛 Bug Fixes

- *(deps)* Update dependency chalk to v5.5.0 ([#569](https://github.com/neoskop/migrateus/issues/569))
- *(deps)* Update nest monorepo to v11.1.6 ([#575](https://github.com/neoskop/migrateus/issues/575))
- *(deps)* Update dependency pretty-bytes to v7.0.1 ([#580](https://github.com/neoskop/migrateus/issues/580))
- *(deps)* Update dependency chalk to v5.6.0 ([#583](https://github.com/neoskop/migrateus/issues/583))
- *(deps)* Update dependency @inquirer/confirm to v5.1.15 ([#584](https://github.com/neoskop/migrateus/issues/584))
- *(deps)* Update dependency nest-commander to v3.19.0 ([#587](https://github.com/neoskop/migrateus/issues/587))
- *(deps)* Update dependency @inquirer/confirm to v5.1.16 ([#590](https://github.com/neoskop/migrateus/issues/590))
- *(deps)* Update dependency @inquirer/expand to v4.0.18 ([#591](https://github.com/neoskop/migrateus/issues/591))
- *(deps)* Update dependency @inquirer/password to v4.0.18 ([#592](https://github.com/neoskop/migrateus/issues/592))
- *(deps)* Update dependency @inquirer/select to v4.3.2 ([#593](https://github.com/neoskop/migrateus/issues/593))
- *(deps)* Update dependency @inquirer/core to v10.2.0 ([#594](https://github.com/neoskop/migrateus/issues/594))
- *(restore)* Fix asset upload after dependency updates
- *(deps)* Update dependency tmp to v0.2.4 [security]
- *(deps)* Update dependency dotenv to v17
- *(deps)* Update dependency @directus/sdk to v20
- *(deps)* Update dependency argon2 to v0.44.0
- *(deps)* Update dependency p-limit to v7
- *(deps)* Update dependency chalk to v5.6.2 ([#602](https://github.com/neoskop/migrateus/issues/602))
- *(deps)* Update dependency dotenv to v17.2.2 ([#603](https://github.com/neoskop/migrateus/issues/603))
- *(deps)* Update dependency nest-commander to v3.19.1 ([#604](https://github.com/neoskop/migrateus/issues/604))
- *(deps)* Update dependency portfinder to v1.0.38 ([#605](https://github.com/neoskop/migrateus/issues/605))
- *(deps)* Update dependency @inquirer/confirm to v5.1.18 ([#608](https://github.com/neoskop/migrateus/issues/608))
- *(deps)* Update dependency @inquirer/core to v10.2.2 ([#609](https://github.com/neoskop/migrateus/issues/609))
- *(deps)* Update dependency @inquirer/expand to v4.0.20 ([#610](https://github.com/neoskop/migrateus/issues/610))
- *(deps)* Update dependency @inquirer/password to v4.0.20 ([#611](https://github.com/neoskop/migrateus/issues/611))
- *(deps)* Update dependency @inquirer/select to v4.3.4 ([#612](https://github.com/neoskop/migrateus/issues/612))

## [2.3.2] - 2025-07-25

### 🐛 Bug Fixes

- *(deps)* Update dependency nest-commander to v3.18.0 ([#541](https://github.com/neoskop/migrateus/issues/541))
- *(deps)* Update nest monorepo to v11.1.4 ([#542](https://github.com/neoskop/migrateus/issues/542))
- *(deps)* Update nest monorepo to v11.1.5 ([#543](https://github.com/neoskop/migrateus/issues/543))
- *(deps)* Update dependency @inquirer/confirm to v5.1.14 ([#548](https://github.com/neoskop/migrateus/issues/548))
- *(deps)* Update dependency @inquirer/core to v10.1.15 ([#549](https://github.com/neoskop/migrateus/issues/549))
- *(deps)* Update dependency @inquirer/expand to v4.0.17 ([#550](https://github.com/neoskop/migrateus/issues/550))
- *(deps)* Update dependency @inquirer/figures to v1.0.13 ([#551](https://github.com/neoskop/migrateus/issues/551))
- *(deps)* Update dependency @inquirer/password to v4.0.17 ([#552](https://github.com/neoskop/migrateus/issues/552))
- *(deps)* Update dependency @inquirer/type to v3.0.8 ([#553](https://github.com/neoskop/migrateus/issues/553))
- *(deps)* Update dependency @inquirer/select to v4.3.0 ([#554](https://github.com/neoskop/migrateus/issues/554))
- *(deps)* Update dependency @inquirer/select to v4.3.1 ([#556](https://github.com/neoskop/migrateus/issues/556))
- *(backup-db)* Fix error when deployment did not have `envFrom` field in k8s environment

## [2.3.1] - 2025-07-12

### 🐛 Bug Fixes

- *(deps)* Update dependency dotenv to v16.6.0 ([#511](https://github.com/neoskop/migrateus/issues/511))
- *(deps)* Update dependency dotenv to v16.6.1 ([#513](https://github.com/neoskop/migrateus/issues/513))
- *(deps)* Update dependency @inquirer/confirm to v5.1.13 ([#521](https://github.com/neoskop/migrateus/issues/521))
- *(deps)* Update dependency @inquirer/core to v10.1.14 ([#522](https://github.com/neoskop/migrateus/issues/522))
- *(deps)* Update dependency @inquirer/expand to v4.0.16 ([#523](https://github.com/neoskop/migrateus/issues/523))
- *(deps)* Update dependency @inquirer/password to v4.0.16 ([#524](https://github.com/neoskop/migrateus/issues/524))
- *(deps)* Update dependency @inquirer/select to v4.2.4 ([#525](https://github.com/neoskop/migrateus/issues/525))
- Fix extraction of k8s database credentials for newer Directus helm chart versions

## [2.3.0] - 2025-06-17

### 🚀 Features

- *(schema-diff)* Use `ProgressService`
- *(schema-diff)* Allow for faster selection of diffs

### 🐛 Bug Fixes

- *(migrate-data)* Remove empty line from prompt
- Fix progress logs in `schema-diff` and `migrate-data` commands

### 📚 Documentation

- *(README)* Add caveat for `migrate-data` command

## [2.2.0] - 2025-06-17

### 🚀 Features

- Add new command `migrate-data`
- *(migrate-data)* Add double check
- *(migrate-data)* Add progress messages

### 🐛 Bug Fixes

- *(deps)* Update dependency pretty-bytes to v7
- *(deps)* Update dependency shelljs to v0.10.0
- *(deps)* Update dependency @inquirer/confirm to v5.1.11 ([#463](https://github.com/neoskop/migrateus/issues/463))
- *(deps)* Update dependency @inquirer/core to v10.1.12 ([#464](https://github.com/neoskop/migrateus/issues/464))
- *(deps)* Update dependency @inquirer/expand to v4.0.14 ([#465](https://github.com/neoskop/migrateus/issues/465))
- *(deps)* Update dependency @inquirer/figures to v1.0.12 ([#466](https://github.com/neoskop/migrateus/issues/466))
- *(deps)* Update dependency @inquirer/password to v4.0.14 ([#467](https://github.com/neoskop/migrateus/issues/467))
- *(deps)* Update dependency @inquirer/select to v4.2.2 ([#468](https://github.com/neoskop/migrateus/issues/468))
- *(deps)* Update dependency @inquirer/type to v3.0.7 ([#469](https://github.com/neoskop/migrateus/issues/469))
- *(deps)* Update dependency @inquirer/confirm to v5.1.12 ([#470](https://github.com/neoskop/migrateus/issues/470))
- *(deps)* Update dependency @inquirer/core to v10.1.13 ([#471](https://github.com/neoskop/migrateus/issues/471))
- *(deps)* Update dependency @inquirer/expand to v4.0.15 ([#472](https://github.com/neoskop/migrateus/issues/472))
- *(deps)* Update dependency @inquirer/password to v4.0.15 ([#473](https://github.com/neoskop/migrateus/issues/473))
- *(deps)* Update dependency @inquirer/select to v4.2.3 ([#474](https://github.com/neoskop/migrateus/issues/474))
- *(deps)* Update nest monorepo to v11.1.2 ([#475](https://github.com/neoskop/migrateus/issues/475))
- *(deps)* Update dependency file-type to v21
- *(deps)* Update nest monorepo to v11.1.3 ([#487](https://github.com/neoskop/migrateus/issues/487))
- *(deps)* Update dependency glob to v11.0.3 ([#495](https://github.com/neoskop/migrateus/issues/495))

### 🚜 Refactor

- *(restore)* Remove unused `await` statement

### 📚 Documentation

- *(TODO)* Update todos
- *(README)* Add `migrate-data` command

## [2.1.0] - 2025-05-14

### 🚀 Features

- *(schema-diff)* Add key to show details
- *(schema-diff)* Allow saving of raw schema diff to disk

### 🐛 Bug Fixes

- *(deps)* Update dependency argon2 to v0.43.0
- *(deps)* Update dependency file-type to v20.5.0 ([#423](https://github.com/neoskop/migrateus/issues/423))
- *(deps)* Update dependency portfinder to v1.0.37 ([#427](https://github.com/neoskop/migrateus/issues/427))
- *(deps)* Update dependency @inquirer/confirm to v5.1.10 ([#444](https://github.com/neoskop/migrateus/issues/444))
- *(deps)* Update dependency @inquirer/core to v10.1.11 ([#445](https://github.com/neoskop/migrateus/issues/445))
- *(deps)* Update dependency @inquirer/expand to v4.0.13 ([#446](https://github.com/neoskop/migrateus/issues/446))
- *(deps)* Update dependency @inquirer/password to v4.0.13 ([#447](https://github.com/neoskop/migrateus/issues/447))
- *(deps)* Update dependency @inquirer/select to v4.2.1 ([#448](https://github.com/neoskop/migrateus/issues/448))
- *(deps)* Update dependency semver to v7.7.2 ([#452](https://github.com/neoskop/migrateus/issues/452))
- Show better error when refrenced environment was not found
- *(schema-diff)* Fix missing items when the collection was not affected

## [2.0.0] - 2025-04-26

### 🚀 Features

- *(schema-diff)* Add multi-select for changes instead of a series of questions

### 🐛 Bug Fixes

- *(deps)* Update nest monorepo to v11.0.15 ([#399](https://github.com/neoskop/migrateus/issues/399))
- *(deps)* Update dependency dotenv to v16.5.0 ([#400](https://github.com/neoskop/migrateus/issues/400))
- *(deps)* Update nest monorepo to v11.0.16 ([#401](https://github.com/neoskop/migrateus/issues/401))
- *(deps)* Update nest monorepo to v11.0.17 ([#405](https://github.com/neoskop/migrateus/issues/405))
- *(deps)* Update dependency portfinder to v1.0.36 ([#406](https://github.com/neoskop/migrateus/issues/406))
- *(deps)* Update nest monorepo to v11.0.19 ([#409](https://github.com/neoskop/migrateus/issues/409))
- *(deps)* Update nest monorepo to v11.0.20 ([#410](https://github.com/neoskop/migrateus/issues/410))
- *(deps)* Update nest monorepo to v11.0.7 ([#415](https://github.com/neoskop/migrateus/issues/415))
- *(deps)* Update dependency glob to v11.0.2 ([#416](https://github.com/neoskop/migrateus/issues/416))
- *(deps)* Update dependency @inquirer/select to v4.2.0 ([#417](https://github.com/neoskop/migrateus/issues/417))

## [1.5.2] - 2025-04-09

### 🐛 Bug Fixes

- *(deps)* Update dependency nest-commander to v3.16.1 ([#330](https://github.com/neoskop/migrateus/issues/330))
- *(deps)* Update dependency nanoid to v5.1.3 ([#339](https://github.com/neoskop/migrateus/issues/339))
- *(deps)* Update dependency @inquirer/confirm to v5.1.7 ([#342](https://github.com/neoskop/migrateus/issues/342))
- *(deps)* Update dependency @inquirer/expand to v4.0.10 ([#343](https://github.com/neoskop/migrateus/issues/343))
- *(deps)* Update dependency @inquirer/password to v4.0.10 ([#344](https://github.com/neoskop/migrateus/issues/344))
- *(deps)* Update dependency @inquirer/select to v4.0.10 ([#345](https://github.com/neoskop/migrateus/issues/345))
- *(deps)* Update dependency portfinder to v1.0.34 ([#349](https://github.com/neoskop/migrateus/issues/349))
- *(deps)* Update dependency file-type to v20.4.1 ([#350](https://github.com/neoskop/migrateus/issues/350))
- *(deps)* Update dependency portfinder to v1.0.35 ([#351](https://github.com/neoskop/migrateus/issues/351))
- *(deps)* Update dependency nest-commander to v3.17.0 ([#352](https://github.com/neoskop/migrateus/issues/352))
- *(deps)* Update dependency @inquirer/confirm to v5.1.8 ([#353](https://github.com/neoskop/migrateus/issues/353))
- *(deps)* Update dependency @inquirer/expand to v4.0.11 ([#354](https://github.com/neoskop/migrateus/issues/354))
- *(deps)* Update dependency @inquirer/password to v4.0.11 ([#355](https://github.com/neoskop/migrateus/issues/355))
- *(deps)* Update dependency @inquirer/select to v4.1.0 ([#356](https://github.com/neoskop/migrateus/issues/356))
- *(deps)* Update dependency nanoid to v5.1.4 ([#357](https://github.com/neoskop/migrateus/issues/357))
- *(deps)* Update dependency nanoid to v5.1.5 ([#359](https://github.com/neoskop/migrateus/issues/359))
- *(deps)* Update nest monorepo to v11.0.12 ([#360](https://github.com/neoskop/migrateus/issues/360))
- *(deps)* Update dependency @directus/sdk to v19.1.0 ([#374](https://github.com/neoskop/migrateus/issues/374))
- *(deps)* Update nest monorepo to v11.0.13 ([#386](https://github.com/neoskop/migrateus/issues/386))
- *(deps)* Update dependency @inquirer/expand to v4.0.12 ([#387](https://github.com/neoskop/migrateus/issues/387))
- *(deps)* Update dependency @inquirer/password to v4.0.12 ([#388](https://github.com/neoskop/migrateus/issues/388))
- *(deps)* Update dependency @inquirer/confirm to v5.1.9 ([#389](https://github.com/neoskop/migrateus/issues/389))
- *(deps)* Update dependency @inquirer/select to v4.1.1 ([#390](https://github.com/neoskop/migrateus/issues/390))
- Fix Directus asset service typings
- *(deps)* Update dependency shelljs to v0.9.2
- *(deps)* Update dependency mime-types to v3
- *(deps)* Update nest monorepo to v11.0.14 ([#397](https://github.com/neoskop/migrateus/issues/397))

## [1.5.1] - 2025-02-28

### 🐛 Bug Fixes

- *(deps)* Update nest monorepo to v11.0.11 ([#329](https://github.com/neoskop/migrateus/issues/329))
- Fix missing package
- Fix import of `mime-types` package

## [1.5.0] - 2025-02-27

### 🚀 Features

- *(schema-diff)* Add config option to ignore fields and collections

## [1.4.2] - 2025-02-27

### 🐛 Bug Fixes

- *(deps)* Update dependency file-type to v20
- *(deps)* Update nest monorepo to v11
- *(deps)* Update dependency @directus/sdk to v19

## [1.4.1] - 2025-02-27

### 🐛 Bug Fixes

- *(deps)* Update dependency uuid to v11.0.4 ([#248](https://github.com/neoskop/migrateus/issues/248))
- *(deps)* Update dependency uuid to v11.0.5 ([#252](https://github.com/neoskop/migrateus/issues/252))
- *(deps)* Update dependency glob to v11.0.1 ([#253](https://github.com/neoskop/migrateus/issues/253))
- *(deps)* Update dependency @inquirer/confirm to v5.1.2 ([#256](https://github.com/neoskop/migrateus/issues/256))
- *(deps)* Update dependency @inquirer/expand to v4.0.5 ([#257](https://github.com/neoskop/migrateus/issues/257))
- *(deps)* Update dependency @inquirer/password to v4.0.5 ([#258](https://github.com/neoskop/migrateus/issues/258))
- *(deps)* Update dependency @inquirer/select to v4.0.5 ([#259](https://github.com/neoskop/migrateus/issues/259))
- *(deps)* Update dependency @inquirer/confirm to v5.1.3 ([#264](https://github.com/neoskop/migrateus/issues/264))
- *(deps)* Update dependency @inquirer/expand to v4.0.6 ([#265](https://github.com/neoskop/migrateus/issues/265))
- *(deps)* Update dependency @inquirer/password to v4.0.6 ([#266](https://github.com/neoskop/migrateus/issues/266))
- *(deps)* Update dependency @inquirer/select to v4.0.6 ([#267](https://github.com/neoskop/migrateus/issues/267))
- *(deps)* Update dependency nest-winston to v1.10.1 ([#268](https://github.com/neoskop/migrateus/issues/268))
- *(deps)* Update dependency nest-winston to v1.10.2 ([#277](https://github.com/neoskop/migrateus/issues/277))
- *(deps)* Update dependency nest-commander to v3.16.0 ([#286](https://github.com/neoskop/migrateus/issues/286))
- *(deps)* Update dependency @inquirer/confirm to v5.1.4 ([#288](https://github.com/neoskop/migrateus/issues/288))
- *(deps)* Update dependency @inquirer/expand to v4.0.7 ([#289](https://github.com/neoskop/migrateus/issues/289))
- *(deps)* Update dependency @inquirer/password to v4.0.7 ([#290](https://github.com/neoskop/migrateus/issues/290))
- *(deps)* Update dependency @inquirer/select to v4.0.7 ([#291](https://github.com/neoskop/migrateus/issues/291))
- *(deps)* Update dependency semver to v7.7.0 ([#292](https://github.com/neoskop/migrateus/issues/292))
- *(deps)* Update dependency ora to v8.2.0 ([#294](https://github.com/neoskop/migrateus/issues/294))
- *(deps)* Update dependency @inquirer/confirm to v5.1.5 ([#295](https://github.com/neoskop/migrateus/issues/295))
- *(deps)* Update dependency @inquirer/expand to v4.0.8 ([#296](https://github.com/neoskop/migrateus/issues/296))
- *(deps)* Update dependency @inquirer/password to v4.0.8 ([#297](https://github.com/neoskop/migrateus/issues/297))
- *(deps)* Update dependency @inquirer/select to v4.0.8 ([#298](https://github.com/neoskop/migrateus/issues/298))
- *(deps)* Update dependency semver to v7.7.1 ([#301](https://github.com/neoskop/migrateus/issues/301))
- *(deps)* Update dependency nanoid to v5.1.0 ([#311](https://github.com/neoskop/migrateus/issues/311))
- *(deps)* Update dependency @inquirer/confirm to v5.1.6 ([#312](https://github.com/neoskop/migrateus/issues/312))
- *(deps)* Update dependency @inquirer/expand to v4.0.9 ([#313](https://github.com/neoskop/migrateus/issues/313))
- *(deps)* Update dependency @inquirer/password to v4.0.9 ([#314](https://github.com/neoskop/migrateus/issues/314))
- *(deps)* Update dependency @inquirer/select to v4.0.9 ([#315](https://github.com/neoskop/migrateus/issues/315))
- *(deps)* Update dependency uuid to v11.1.0 ([#318](https://github.com/neoskop/migrateus/issues/318))
- *(deps)* Update dependency rxjs to v7.8.2 ([#321](https://github.com/neoskop/migrateus/issues/321))
- *(deps)* Update dependency nanoid to v5.1.2 ([#323](https://github.com/neoskop/migrateus/issues/323))
- *(deps)* Update dependency portfinder to v1.0.33 ([#327](https://github.com/neoskop/migrateus/issues/327))
- Fix directus asset service after dependency updates

## [1.4.0] - 2025-01-03

### 🚀 Features

- Print meaningful error messages for `kubectl` commands
- Switch to pnpm

### 🐛 Bug Fixes

- *(deps)* Update dependency @directus/sdk to v18.0.2 ([#231](https://github.com/neoskop/migrateus/issues/231))
- *(deps)* Update dependency @directus/sdk to v18.0.3 ([#233](https://github.com/neoskop/migrateus/issues/233))
- *(deps)* Update dependency chalk to v5.4.0 ([#234](https://github.com/neoskop/migrateus/issues/234))
- *(deps)* Update dependency p-limit to v6.2.0 ([#235](https://github.com/neoskop/migrateus/issues/235))
- *(deps)* Update dependency @inquirer/expand to v4.0.4 ([#236](https://github.com/neoskop/migrateus/issues/236))
- *(deps)* Update dependency @inquirer/confirm to v5.1.1 ([#237](https://github.com/neoskop/migrateus/issues/237))
- *(deps)* Update dependency @inquirer/password to v4.0.4 ([#238](https://github.com/neoskop/migrateus/issues/238))
- *(deps)* Update dependency @inquirer/select to v4.0.4 ([#239](https://github.com/neoskop/migrateus/issues/239))
- *(deps)* Update dependency chalk to v5.4.1 ([#240](https://github.com/neoskop/migrateus/issues/240))

## [1.3.2] - 2024-12-12

### 🐛 Bug Fixes

- *(deps)* Update dependency uuid to v11
- *(deps)* Update nest monorepo to v10.4.13 ([#221](https://github.com/neoskop/migrateus/issues/221))
- *(deps)* Update dependency dotenv to v16.4.7 ([#222](https://github.com/neoskop/migrateus/issues/222))
- *(deps)* Update dependency @inquirer/expand to v4.0.3 ([#143](https://github.com/neoskop/migrateus/issues/143))
- *(deps)* Update dependency @inquirer/password to v4.0.3 ([#144](https://github.com/neoskop/migrateus/issues/144))
- *(deps)* Update dependency @inquirer/select to v4.0.3 ([#145](https://github.com/neoskop/migrateus/issues/145))
- *(deps)* Update dependency @inquirer/confirm to v5.1.0 ([#142](https://github.com/neoskop/migrateus/issues/142))
- Fix interoperability issues between MySQL 5.7 and 8

### ⚙️ Miscellaneous Tasks

- Update deps
- *(config)* Migrate config renovate.json

## [1.3.1] - 2024-12-03

### 🐛 Bug Fixes

- *(deps)* Update nest monorepo to v10.4.7
- *(deps)* Update dependency winston to v3.17.0 ([#190](https://github.com/neoskop/migrateus/issues/190))
- *(deps)* Update nest monorepo to v10.4.8 ([#193](https://github.com/neoskop/migrateus/issues/193))
- *(deps)* Update nest monorepo to v10.4.9 ([#204](https://github.com/neoskop/migrateus/issues/204))
- *(deps)* Update dependency nanoid to v5.0.9 ([#210](https://github.com/neoskop/migrateus/issues/210))
- *(deps)* Update nest monorepo to v10.4.10 ([#211](https://github.com/neoskop/migrateus/issues/211))
- *(deps)* Update nest monorepo to v10.4.11 ([#212](https://github.com/neoskop/migrateus/issues/212))
- *(deps)* Update nest monorepo to v10.4.12 ([#214](https://github.com/neoskop/migrateus/issues/214))
- *(deps)* Update dependency dotenv to v16.4.6 ([#218](https://github.com/neoskop/migrateus/issues/218))
- *(schema-diff)* Add array type to color map

## [1.3.0] - 2024-11-04

### 🚀 Features

- *(backup-db)* Add compatibility options for PXC to `mysqldump` command

### 🐛 Bug Fixes

- *(deps)* Update nest monorepo to v10.4.4
- *(deps)* Update dependency winston to v3.15.0
- *(deps)* Update dependency @directus/sdk to v17.0.2
- *(deps)* Update dependency file-type to v19.6.0
- *(deps)* Update nest monorepo
- *(deps)* Update nest monorepo to v10.4.6
- *(deps)* Update dependency nanoid to v5.0.8
- *(deps)* Update dependency ora to v8.1.1
- *(deps)* Update dependency winston to v3.16.0
- *(backup-db)* Remove single-transaction falg for mysql 8 compatibility

### 📚 Documentation

- Update TODO

## [1.2.1] - 2024-09-17

### 🐛 Bug Fixes

- *(deps)* Update nest monorepo to v10.4.2
- *(deps)* Update dependency date-fns to v4
- *(deps)* Update dependency @inquirer/expand to v3
- *(deps)* Update nest monorepo to v10.4.3
- *(deps)* Update dependency @inquirer/password to v3
- *(deps)* Update dependency @inquirer/confirm to v4
- *(deps)* Update dependency @inquirer/select to v3

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
