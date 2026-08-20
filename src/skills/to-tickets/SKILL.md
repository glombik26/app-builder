---
name: to-tickets
description: Break the spec into tracer-bullet tickets as files in the Feature worktree.
disable-model-invocation: true
---

Break the spec or conversation into tracer-bullet tickets. Write one file per ticket under `.scratch/issues/` in this worktree, numbered from `01` in dependency order. Do not publish tickets to GitHub. Do not commit.

Each ticket is a vertical slice — a complete path through the layers, demoable on its own, sized for one fresh context window. Give each ticket its blocking edges.

Work from `.scratch/spec.md` when it exists. Quiz the Operator at the turn boundary (the next prompt after stopReason) until the breakdown is approved, then write the files.

Each file:

```
# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work.

**Blocked by:** the numbers/titles that gate this one, or "None — can start immediately".

- [ ] Acceptance criterion
```
