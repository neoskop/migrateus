# Plan 5: engine detection + ACA wiring + config

> Autonomous, subagent-driven, on `main`. Unit tests mock `exec`. ACA end-to-end remains UNVERIFIED (no Azure); wiring is unit-tested for DI resolution + command shapes.

## Decisions (autonomous)

- **Engine detection:** `DockerService.databaseConfig` and `K8sService` config builder must also read `DB_CLIENT` → `client` and `DB_FILENAME` → `filename` (truthy-guarded — empty/secretRef values must not set an invalid client). Fix the same truthy-guard Minor in `AcaService.setup` (from Plan 4 review).
- **`${ENV_VAR}` interpolation:** if `ConfigService` does not already interpolate `${VAR}` in `migrateus.yml`, add a substitution pass over string values at load time (keeps secrets out of the file, per the design spec). If it already does, leave it.
- **ACA dispatch wiring:** add an `aca` branch to every platform dispatch point so ACA is usable (and never silently falls to k8s):
  - `backup-db/backup-db.service.ts`, `restore-db/restore-db.command.ts`, `schema-diff/schema-diff.service.ts`, `migrate-data/migrate-data.service.ts`, `clean/clean.service.ts`, `rename-collection/rename-collection.service.ts`.
- **ACA backup/restore performers mirror the K8S variants** (`K8sBackupService`/`K8sRestoreService`), NOT the docker ones — ACA has no bind-mount, so it uses `exfilFile`/`infilFile` like k8s. Create `AcaBackupService` + `AcaRestoreService`, register in `BackupDbModule`/`RestoreDbModule` + the dispatch services.

## Known gaps (flagged)

- ACA `az containerapp exec`/file-transfer remain unverified (Plan 4). Wiring makes ACA selectable and DI-resolvable; real runs need a live ACA environment.
- The CLI flag surface (`backup-db`/`restore-db`/`schema-diff` arguments) is left as-is — the existing per-environment command structure already supports "from/between environments". No flag renames (avoids breaking the working CLI).
- MySQL→PG transfer still throws `NotYetSupported` (Plan 3).

## Tasks
- **T1 — engine detection + config interpolation.** Add `client`/`filename` to docker + k8s DB-config builders (truthy-guarded); fix the aca guard; add `${ENV_VAR}` interpolation in `ConfigService` if missing. Unit tests.
- **T2 — ACA performers + dispatch wiring.** `AcaBackupService`/`AcaRestoreService` (mirror k8s variants); `aca` branches in the 6 dispatch points; module registration. Unit tests assert ACA routes to the ACA services and DI resolves. Full suite green.

Each task ends `pnpm test` green; Conventional Commits, no `Co-Authored-By`.
