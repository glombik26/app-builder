# First-cut surface is stage-led; Preview is links; home is the Project list

The first Operator surface is a web UI whose home is the Project list. A Project shows its Features plus TEST/PROD status-and-links and Freigabe TEST→PROD. A Feature is one screen: chrome (name, Preview status and one link per public HTTP service, abort, Freigabe DEV→TEST once implement is closed), a rail of the four Stages, and the open Stage's body (Harness stream and prompt; in implement, the Ticket list). Stages are gates the Operator closes. grill-with-docs and to-spec share one stream. A Preview opens in a new tab. There is no iframe, git-diff panel, environment dashboard, or API console. Device-code is a blocking Platform gate. After Freigabe the Feature row remains (name taken) but cannot replay — the worktree is gone. After abort the record is gone and the name is free.

A chat-primary surface was rejected: Stage is a lockable gate and implement is a Ticket shell. An embedded Preview iframe was rejected: target apps set `X-Frame-Options` and must feel like the real origin. A Feature inbox across Projects was rejected: Freigabe TEST→PROD is a Project act. A Platform-owned transcript so Freigabe could replay was already rejected in ADR 0005.

## Considered Options

- **Stage-led Feature screen on a Project tree; Preview as status plus links** (accepted)
- Chat as the primary Feature surface, Stages as a progress bar
- Preview in an iframe (with or without a link)
- Git-diff as a first-class panel
- Home as a cross-Project Feature inbox
- Special API-console surface for backend-only stacks
- Replay after Freigabe via a Platform transcript
