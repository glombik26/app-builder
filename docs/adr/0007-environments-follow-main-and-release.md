# TEST follows main, PROD follows release; Freigabe is merge then fast-forward

DEV holds only Previews — no standing stack of the default branch. TEST is one standing Compose project per Project, created when the Project is added, following `main`, and accumulating every Feature merged there. PROD is one standing Compose project following a long-lived `release` branch; it appears on the first Freigabe TEST→PROD, which creates `release` if needed. Freigabe DEV→TEST is allowed only after implement is closed: the Platform merges the Feature into `origin/main` without a PR and deletes the Preview, worktree, and Feature branch; the Feature record stays and the name stays taken. Freigabe TEST→PROD is allowed anytime and fast-forwards `release` to the `main` commit TEST is on, or fails; it promotes the whole integration stand, not one Feature. Each Environment rebuilds when its tracking ref moves. A Git tag may label a Release; the tag is not the motor.

Image promotion was rejected: there is no registry, and TEST is `main` after a merge, not the Preview bit-for-bit. A single Feature candidate on TEST that the next Freigabe replaces was rejected: TEST is the integration stand. A Git tag as the PROD ref was rejected because the branch is the motor. Opening a PR for the merge was rejected because Freigabe is already the Operator's yes. Force-updating or merge-committing onto `release` was rejected; a fourth Environment for hotfixes is out of scope for this map.

## Considered Options

- **TEST tracks `main`, PROD tracks `release`; Freigabe merges then fast-forwards** (accepted)
- Promote the same images DEV → TEST → PROD
- TEST is one Feature candidate; the next Freigabe replaces it
- PROD tracks a new Git tag per Freigabe
- Freigabe DEV→TEST opens a GitHub PR
- Force-forward or merge-commit when `release` has diverged
