# Platform records live as files beside the clones

The Platform's facts about Projects and Features — existence, stage machine, Harness session pointers, implement ticket gates, per-Project PAT — live as files under a Platform home on the VPS, next to the clones, not inside them and not in this repo. Records are source of truth for those objects; disk (clone, worktree, `.scratch/`, `~/.grok/sessions`) is source of truth for content. There is no cache layer. Clone path, worktree path, and the Feature branch name `feature/<name>` are derived from identity, not stored. A VPS reboot keeps records, clones, worktrees, and session files; it does not revive Harness or Preview processes.

SQLite, GitHub as the runtime store, committing live state into this repo, records inside the worktree, one monolithic state file, and deriving object existence from disk were rejected: one Operator does not need a database or a second SoT on GitHub; this repo is the spec, not the runtime; mixing control state with Feature artifacts repeats treating the Feature as a directory; Operator-closed stages cannot be inferred from file appearance.

## Considered Options

- **Files under a Platform home; records vs content; derived paths** (accepted)
- SQLite (or similar) on the VPS
- Files inside the Project clone / Feature worktree
- This Platform repo (committed)
- GitHub Issues / Projects as runtime source of truth
- No store: derive objects from clones, worktrees, `.scratch/`, and `~/.grok/sessions`
- One `state.json` for every object
- Per-Project directory holding clone, records, and worktrees together
