# Guided Workflow stages chain through the worktree; implement is a Ticket shell

The Operator closes every Stage; the Platform never advances on its own. A closed Stage can be reopened until the next Stage starts, then it is locked — the only way back is aborting the Feature. grill-with-docs and to-spec share one continued Harness session because to-spec synthesizes that conversation; to-tickets and each Ticket in implement start fresh and read only the Feature worktree. Handoffs are files (`.scratch/spec.md`, `.scratch/issues/`), not issues on the Project: the Feature branch stays local during development. implement is a shell: one Harness session per Ticket, at most one at a time, Operator-picked from the unblocked frontier, every Ticket closed before the Stage can close.

## Considered Options

- **Worktree handoffs + hybrid sessions + implement-as-Ticket-shell** (accepted)
- One Harness session for the whole Feature (grill context would ride into implement)
- One fresh session per Stage, including grill → to-spec (breaks to-spec's "synthesize this conversation" contract)
- Spec and Tickets as GitHub issues on the Project (would publish unfinished work while the branch is still local-only)
- Platform auto-advances when an artifact appears
- Repeat an earlier Stage after the next has started, marking later artifacts stale (rejected: abort the Feature instead)
- One implement session for all Tickets (rejected: implement is a shell around per-Ticket sessions)
- Parallel Ticket sessions on the same worktree (two writers, no merge)
