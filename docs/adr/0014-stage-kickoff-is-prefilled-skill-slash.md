# Stage kickoff is a prefilled skill slash; session rules stay thin; adapted skills live once under the Platform user

The first Turn of a Slot, and the grill-with-docs → to-spec gate, start as a Platform-authored slash (`/grill-with-docs <Feature name>`, `/to-spec`, `/to-tickets`, `/implement .scratch/issues/<file>`) sitting in the prompt box. The Operator may edit it and must send it — the Platform never auto-sends. Later Turns are an empty box. Reopening an unlocked Stage continues the same session with no new kickoff; reopening a Ticket is a new Slot and gets the implement prefill again. Every `session/new` carries the same English `_meta.rules` block that forbids mid-turn cards (`ask_user_question`, plan mode / plan approval) and says the Operator answers only after `stopReason`. Stage behaviour lives in adapted copies of `grill-with-docs`, `to-spec`, `to-tickets`, and `implement`, installed once under the Platform user (`~/.grok/skills/`) so every Project sees the same files and versions. Those copies write `.scratch/spec.md` and `.scratch/issues/` and do not commit — user-level skills hide Grok's bundled `/implement` orchestrator, so the bare slash is the Platform copy.

A long Platform prose prompt was rejected: the Stages are those skills, and they have `disable-model-invocation`, so without a slash they stay dead. Auto-sending the kickoff was rejected: one extra click is cheaper than a Turn nobody ordered. A plugin (`_meta.pluginDirs`) was rejected because a plugin skill does not override bundled `implement`, so `/implement` would be the orchestrator. Copying skills into each Feature worktree was rejected: [Was schreibt implement auf den Feature-Branch, und verlässt der Stand das VPS?](https://github.com/glombik26/app-builder/issues/14) would commit them unless they were ignored, and versions would drift per Project. Fat `_meta.rules` that restated handoff paths and the no-commit rule were rejected: that belongs in the skill body. Renaming the implement skill (`/implement-ticket`) was unnecessary once the copy is a user skill.

## Considered Options

- **Prefill + Operator send; thin global `_meta.rules`; adapted skills once under `~/.grok/skills/`** (accepted)
- Platform prose instead of a skill slash
- Auto-send the kickoff when the Slot or Stage starts
- Operator types the first prompt with no prefill
- `_meta.pluginDirs` / `--plugin-dir` (plugin does not hide bundled `implement`)
- Copy skills into each Feature worktree
- Stock skills plus overrides in rules or in every prefill
- Rename implement to `/implement-ticket` to dodge the bundled orchestrator
- Per-Stage `_meta.rules` or `systemPromptOverride`
