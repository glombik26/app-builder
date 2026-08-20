---
name: to-spec
description: Synthesize the current conversation into the Feature spec file.
disable-model-invocation: true
---

Turn the current conversation and codebase understanding into a spec. Do not interview — synthesize what you already know. Write the spec to `.scratch/spec.md` in this worktree. Do not publish it to GitHub. Do not commit.

Use the project's domain glossary throughout, and respect ADRs in the area you are touching. Prefer existing test seams; keep the number of seams low.

Write `.scratch/spec.md` with:

- Problem Statement
- Solution
- User Stories (numbered, "As an <actor>, I want a <feature>, so that <benefit>")
- Implementation Decisions (modules, interfaces, architecture — no file paths unless a prototype encoded a state machine or type shape)
- Testing Decisions (what a good test is, which module is tested, prior art)
- Out of Scope
- Further Notes
