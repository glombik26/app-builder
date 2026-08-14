# Feature is a platform object, not a Git branch

A Feature is owned by the Platform. Git and disk only carry it: one local branch from the Project's default branch at creation, and one `git worktree` of the Project's single clone, path keyed by Feature identity. Identifying a Feature with a branch, a PR, or a directory would couple its life to GitHub or to a filesystem path. One clone per Feature, a remote branch during development, and stacking onto another Feature were rejected as extra machinery that does not buy isolation the worktree already provides. Abort deletes that worktree and the Feature's branch; it does not touch the Project clone or other Features.

## Considered Options

- **Platform object + worktree of one Project clone** (accepted)
- Feature *is* the branch
- Feature *is* the PR (PaaS preview lifecycle; rejected by substrate research)
- Feature *is* the directory
- Full clone per Feature
- Push the branch to GitHub from creation
- Stack the new branch on another open Feature
