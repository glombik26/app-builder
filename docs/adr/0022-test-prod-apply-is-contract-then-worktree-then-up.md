# TEST and PROD each have a detached worktree; Apply is contract-then-reset-then-up

Each TEST and PROD Environment has its own Platform-owned git worktree on the Project's bare clone, detached at the applied SHA — not a Feature worktree, not an archive, not a checkout inside the clone. Apply (poll, Freigabe, „jetzt ziehen“, reboot) inspects the compose contract at the target SHA on the bare clone first. A miss leaves the worktree untouched and the last good stand up. A hit is `reset --hard` (or `worktree add` on first Apply) then `compose up --build` with the same edge injection as a Preview; no `down`, Docker's image cache. Named volumes persist across Apply, including rewind, and die only with the Project.

`git archive` was rejected: wiping the directory under running bind mounts would take down the last good stand. Checking out in the bare clone is impossible. Sharing a Feature worktree is impossible: TEST/PROD and Features sit on different refs. `compose down` before `up`, and `--no-cache`, were rejected: same last-good-stand rule as Preview. Checking the contract after reset was rejected: a SHA without a compose file would erase the last good files under running containers. Wiping named volumes on rewind was rejected: TEST data outlives a commit.

## Considered Options

- **Detached worktree per Environment; contract at the bare clone, then reset --hard and compose up --build; volumes persist** (accepted)
- `git archive` into a directory (wipe + extract)
- Checkout inside the bare clone
- One shared tree for TEST and PROD
- Reuse a Feature worktree
- `compose down` before `up`
- `--no-cache` on every Apply
- Reset first, then notice the contract is broken
- Wipe named volumes on force-push / rewind
