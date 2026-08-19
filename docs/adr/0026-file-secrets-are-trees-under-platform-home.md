# File Secrets are directory trees under Platform-home; the Platform copies them to relative worktree paths at up

Each Project has three File-Secret trees under Platform-home, next to the record, mode `0600` like the PAT: `state/projects/<owner>/<name>.files.dev/`, `.files.test/`, `.files.prod/`. Paths inside a tree are relative worktree destinations (`certs/sa.json`). DEV is shared by every Preview of that Project; TEST and PROD each have their own. The tree exists only after the first upload on the Project page (path visible, file downloadable, replace/delete); deleting the last file removes the tree — again “missing”. A missing tree is not a gate: Preview and Apply still `up`. Before every `up` the Platform copies each present store path into the Feature or Environment worktree (overwrite, including when that path is tracked) and deletes worktree files whose path left the store; other worktree files stay. If the store is absent the worktree is left alone. Allowed destinations are relative, with no `..`, not absolute, not `.env` / `.env.*`, not the root Compose file, not `.git/`. On every Ticket close the Platform appends any missing DEV-store paths to the Project `.gitignore` — the same seam as [ADR 0020](0020-implement-keeps-secret-paths-out-via-gitignore.md). The Harness does not write the store. Project remove deletes the three trees with the PAT and Environment Secrets.

Stuffing PEM and JSON into Environment Secrets was rejected: Compose may bind-mount files, and [ADR 0020](0020-implement-keeps-secret-paths-out-via-gitignore.md) already treats these paths as files on disk. Store-only-in-the-worktree was rejected: TEST/PROD trees are Platform-owned, the first Apply has no files, and Freigabe deletes the Feature tree. A reserved `secrets/` directory was rejected: it would change the Compose contract. Restricting destinations to the ADR 0020 ignore list was rejected: service-account JSON would not match. A vault or Docker secrets was rejected: one Operator, files under home. Absolute host bind mounts from Platform-home were rejected: they fail the Compose contract. One shared tree for Preview, TEST, and PROD was rejected: Preview must not inherit TEST or PROD identities. The Harness writing the DEV store was rejected: one Feature must not mutate the Project's DEV identity. Missing-file-as-gate was rejected: same as Environment Secrets — a Feature without a PEM still gets a Preview.

## Considered Options

- **Three directory trees under Platform-home; copy/delete managed paths at up** (accepted)
- Encode file contents as Environment Secrets (dotenv values)
- Store only in the worktree
- Reserved `secrets/` directory and `rsync --delete`
- Only destinations already covered by the ADR 0020 ignore list
- Vault / Docker secrets
- Absolute bind mounts from Platform-home
- Same files for Preview, TEST, and PROD
- Harness writes the DEV store during implement
- Missing file rejects Preview / Apply
