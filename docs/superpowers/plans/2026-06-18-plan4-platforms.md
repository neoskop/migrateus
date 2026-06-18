# Plan 4: platforms — docker-over-SSH + ACA

> Autonomous, subagent-driven, on `main`. Unit tests mock `exec`. **No remote Docker host, no Azure available here — integration is UNVERIFIED.** Components are unit-tested; live behavior flagged.

## Decisions (autonomous)

### docker-over-SSH (covers Dokploy / any remote dockerd)
- Add optional `host?: string` (e.g. `ssh://deploy@host`) and `service?: string` to `DockerEnvironment`; `host?` to `DockerComposeEnvironment`.
- `DockerService` exposes `withHost(cmd: string): string` → prefixes `DOCKER_HOST=<host> ` when the active environment has a `host`, else returns `cmd` unchanged. ALL docker invocations in `DockerService` and `DockerContainerService` route through it (`inspect`, `ps`, `start`, `restart`, `compose`, `container create/start/exec/cp/rm`). `DockerContainerService` gets the prefix via its injected `dockerService`.
- Behavior with `host` unset is byte-identical to today (existing tests stay green).
- **Swarm note (flagged, minimal impl):** Dokploy runs Swarm; resolving a service's task container and `--network container:<id>` sharing need real-host validation. `service?` is added to the env + a documented resolution hook, but full Swarm task resolution + netns sharing is left as a live-verification TODO.

### ACA (Azure Container Apps)
- New `AcaEnvironment` (`platform: 'aca'`) with `aca: { subscription, resourceGroup, environment, app, filesShare? }`.
- New `AcaService` (mirrors `DockerService`/`K8sService`): `setup()` reads the Directus app's env via `az containerapp show` → `DatabaseConfig` (incl. `DB_CLIENT`→`client`, `DB_FILENAME`→`filename`); `restartDirectus()` via `az containerapp revision restart`/`update`.
- New `AcaContainerService` (`ContainerService` impl, mirrors `K8sContainerService`): `setup()` creates a throwaway Container App in the same ACA environment running `sleep infinity`; `execute()` via `az containerapp exec`; `cleanUp()`/`cleanUpAll()` via `az containerapp delete`; `exfilFile`/`infilFile` via base64-through-`exec` (small payloads) — **flagged: `az containerapp exec` stdout capture + large `.sqlite` transfer via Azure Files are UNVERIFIED**.
- New `AcaModule`; registered in `app.module.ts`.

## Tasks
- **T1 — docker-over-SSH.** Env field additions + `DockerService.withHost` + route all docker commands through it in `DockerService` and `DockerContainerService`. Unit tests: prefix present when `host` set, absent otherwise; existing docker specs still green.
- **T2 — ACA platform.** `AcaEnvironment`, `AcaService`, `AcaContainerService`, `AcaModule`, app.module registration. Unit tests mock `exec`/`az` asserting command shapes (create/exec/delete/show, base64 file transfer) + error paths.

Each task ends `pnpm test` green; Conventional Commits, no `Co-Authored-By`.
