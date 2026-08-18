# Compose project names are derived; the Platform always passes `-p`

Every Preview, TEST, and PROD stack is a Compose project named from identity, not from the worktree directory. The Platform passes that name as `-p` on every invocation (`up`, rebuild, Apply, stop, `down -v`). Preview is `ab-<project-slug>-dev-<feature-slug>`; TEST is `ab-<project-slug>-test`; PROD is `ab-<project-slug>-prod`. Slugs follow the hostname rules (`owner-name` for the Project). The name is convention, like clone and worktree paths — not a record field — so a reboot Apply reattaches the same named volumes.

Compose's directory default was rejected: Environment worktrees end in `test/` and `prod/`, Feature worktrees end in the Feature name, and neither is unique on the engine. Omitting `dev` on Preview was rejected: a Feature named `test` or `prod` would collide with TEST or PROD. Opaque platform ids were rejected: they would have to live on the record, and `docker compose ls` would go dark. Storing the name was rejected: identity is immutable and slug collisions are already refused at create. Writing `COMPOSE_PROJECT_NAME` into the project's compose file or an injected file was rejected: the name would leak into the target repository. Treating a project's `.env` `COMPOSE_PROJECT_NAME` as a contract break was rejected: `-p` already wins.

## Considered Options

- **Derived `ab-…` names via `-p`; convention, not a record** (accepted)
- Directory name (Compose default)
- Preview without `dev`
- No `ab-` prefix
- Opaque platform ids
- Slugified worktree path
- Store the name on the Project or Feature record
- `COMPOSE_PROJECT_NAME` in the project's `.env` is a contract break
- Write the name into the project's compose file or an injected file
