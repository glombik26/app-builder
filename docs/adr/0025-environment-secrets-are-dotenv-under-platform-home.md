# Environment Secrets are dotenv files under Platform-home; the Platform copies them to `.env` at up

Each Project has three dotenv files under Platform-home, next to the record, mode `0600` like the PAT: `state/projects/<owner>/<name>.env.dev`, `.env.test`, `.env.prod`. DEV is shared by every Preview of that Project; TEST and PROD each have their own. The file exists only after the Operator saves it on the Project page (content is visible and editable); clearing the field deletes it. A missing file is not a gate: Preview and Apply still `up`. Before every `up` the Platform copies a present file onto `.env` in the Feature or Environment worktree (overwrite); if the store file is absent the worktree `.env` is left alone. Compose's default and `env_file: .env` both see it.

One shared set for Preview, TEST, and PROD was rejected: Preview must not inherit TEST's outbound identity, and only PROD sees production interfaces. A per-Feature DEV store was rejected: Features die at Freigabe DEV→TEST and the Operator would re-type the same DEV keys. Keeping the store only in the worktree was rejected: TEST/PROD trees are Platform-owned, the first Apply has no `.env`, and Freigabe deletes the Feature tree. A vault or Docker secrets was rejected: one Operator, files under home. Empty files at Project-add were rejected: they would count as present and smash a Harness-written `.env`. `--env-file` alone was rejected: it feeds interpolation, not `env_file: .env`. Injecting every key via the Compose override was rejected: the override stays edge plus `ENVIRONMENT=`. The Harness writing the DEV store was rejected: one Feature must not mutate the Project's DEV identity. File secrets (`*.pem`, service-account JSON) are a separate store — [ADR 0026](0026-file-secrets-are-trees-under-platform-home.md).

## Considered Options

- **Three dotenv files under Platform-home; copy to worktree `.env` when present** (accepted)
- Same values for Preview, TEST, and PROD
- Per-Feature DEV store
- Store only in the worktree
- Vault / Docker secrets
- Empty store files created at Project-add
- `docker compose --env-file <store>` only
- Inject each key as `environment:` on the Platform override
- Harness writes the DEV store during implement
- Also manage file secrets (PEM, JSON keys) in this same store
