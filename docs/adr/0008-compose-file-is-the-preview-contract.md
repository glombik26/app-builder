# One Compose file is the contract; the Platform injects edge and Environment

A Project gets a Preview — and TEST or PROD — only from one Compose file at the repository root, found by Compose's default names (`compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`). The Platform starts that file with an explicit `-f`; `compose.override.yaml` does not count. It injects Traefik labels, the shared proxy network, and `ENVIRONMENT=dev|test|prod`, and `!reset`s host `ports:`. The project marks each public HTTP service with `app-builder.public=true`; without a mark the contract is unmet. A Feature and its Guided Workflow exist without a Preview; the Preview starts when the worktree meets the contract. `container_name`, `network_mode: host`, and absolute host bind mounts fail the contract. A `.env` next to the file is Compose's default and optional; it is not required. Secrets stay out of this decision.

A compose file the project authors with Traefik labels and hostnames was rejected: the edge would leak into every target repository. A dedicated preview compose file was rejected: Preview, TEST, and PROD are different Compose projects, not different files. Inferring the public service from `ports:` was rejected because local files often publish databases. Requiring `.env.test` / `.env.prod` was rejected (usually gitignored; prod values do not belong in Git). Giving a Preview TEST's outbound identity was rejected so Features do not share TEST's external targets; only PROD sees production interfaces.

## Considered Options

- **One root Compose file; Platform injects edge and Environment** (accepted)
- Project compose already carries Traefik labels, proxy network, and no host ports
- Dedicated `compose.preview.yaml` (and another file for TEST/PROD)
- Infer public services from `ports:` / `expose:`
- Required per-Environment env files in the repository
- Preview inherits TEST's outbound Environment
