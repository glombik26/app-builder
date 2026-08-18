# A running Preview rebuilds on a ticket commit or Operator button; a broken contract leaves it up

A running Preview is brought in line with the worktree by `compose up --build` (same edge injection as start). That happens automatically only when the Platform actually writes an implement Ticket commit; otherwise the Feature-chrome button, including mid-Turn. Ticket close is the commit — the rebuild starts after and cannot fail the close. A stopped Preview is not started by a close. A worktree that no longer meets the contract leaves the stack up, shows the break, and refuses rebuild until the contract holds again; Stop remains. A failed rebuild leaves the last good stand reachable. Rebuild does not pass the count-or-RAM admission door. Overlapping requests coalesce to one trailing rebuild against the worktree afterwards; Stop clears that flag.

Every Turn, compose-only auto, a file watcher, button-only (no commit), tearing down on contract break or failed rebuild, making close wait for Docker, re-checking N/RAM, a stale-vs-HEAD indicator, cancelling an in-flight rebuild, and dropping a second request were rejected.

## Considered Options

- **Ticket-commit plus button; broken contract leaves the stack up; last good stand on failure; no admission door; close does not wait; one trailing rebuild** (accepted)
- Rebuild after every Turn
- Auto only when the Compose file changes
- File watcher on the worktree
- Button only — no rebuild on Ticket commit
- Tear the stack down when the contract breaks
- Tear the stack down when rebuild fails
- Ticket close waits for the rebuild
- Rebuild passes N and/or the RAM floor
- Chrome shows worktree drift vs the running stand
- Cancel an in-flight rebuild and start over
- Drop a rebuild request that arrives while one is running
