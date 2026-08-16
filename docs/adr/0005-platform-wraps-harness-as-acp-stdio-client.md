# Platform wraps the Harness as an ACP stdio client; a Turn is the live process

The Platform is the only ACP client: it spawns `grok agent stdio` per Slot (`cwd` = Feature worktree, always-approve) and exposes Platform events to callers. The process lives for one Turn, then dies; a live Slot is attached to, never spawned twice; history is `session/load` replay, not a second transcript. HITL is the next prompt after `stopReason`, plus cancel — not `session/request_permission`, `ask_user_question`, or plan-approval. Subscription login is a Platform device-code ceremony; the token stays in `~/.grok/auth.json`.

Headless (`grok -p`) was rejected: its stream is read-only and cannot carry grill-with-docs. `grok agent serve`, ACP passthrough to the browser, and a Platform-owned transcript were rejected: extra socket and secret, a shallow seam, and a second source of truth. Always-approve is deliberate: the documented mid-turn permission channel is off; Features may still run Turns in parallel, with the existing one-implement-Ticket-per-Feature rule.

## Considered Options

- **ACP stdio per Slot; Platform events; Turn-scoped process; turn-boundary HITL; device-code ceremony** (accepted)
- Headless `grok -p` as the wrapper surface
- Hybrid: ACP for grill-with-docs, headless for implement
- `grok agent serve` on localhost (Grok-specific WebSocket)
- Browser as ACP client
- Raw ACP passthrough to the frontend
- `session/request_permission` as part of the seam
- Process lives only while a browser tab is open
- Process lives for the whole Slot, idle between Turns
- At most one in-flight Turn on the whole Platform
- History from `updates.jsonl` or a Platform transcript
- `XAI_API_KEY` as the Operator subscription
