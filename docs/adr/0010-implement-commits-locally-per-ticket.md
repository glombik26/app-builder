# implement commits per Ticket on a local Feature branch; GitHub stays dark

Closing a Ticket in implement is the snapshot: the Platform stages every non-ignored change and commits, or writes no commit if there is no diff. Author is a Platform identity; message is the Ticket name. implement close is a gate, not a snapshot — a dirty tree refuses. Reopening a Ticket stacks another commit; no amend, no rewind. `.scratch/` stays off the branch via the Project's `.gitignore` (the Platform adds the line if missing). The Feature branch is not pushed and no PR is opened; GitHub first sees the work when Freigabe DEV→TEST merges onto `origin/main`.

Harness-authored commits, one commit at Stage close, committing only at Freigabe, pushing during implement, opening a PR, and keeping `.scratch/` out only via `.git/info/exclude` were rejected.

## Considered Options

- **Per-Ticket Platform commit, local branch, Project `.gitignore` for `.scratch/`** (accepted)
- Harness commits during the session
- One commit when implement closes
- First commit only at Freigabe (conflicts with dirty-tree-fails)
- Push the Feature branch during implement
- Open a PR during implement
- Exclude `.scratch/` only in `.git/info/exclude`
