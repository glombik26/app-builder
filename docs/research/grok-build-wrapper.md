# Grok Build: official wrapper interfaces and subscription auth

Research for [Grok-Build-Anbindung recherchieren](https://github.com/glombik26/app-builder/issues/2).
Facts from first-party sources only. No product decision.

Checked against:

- Local Grok Build user guide under `/home/micha/.grok/docs/user-guide/`
- `grok` 1.0.3 (`1a29d5bc12`, stable) via `/home/micha/.grok/bin/grok --help` and subcommand help
- [Agent Client Protocol](https://agentclientprotocol.com) v1 (stable)
- Official SpaceXAI docs under `https://docs.x.ai/build/`

The local user guide is the more complete Grok-specific source for ACP transports, streaming formats, and `x.ai/*` extensions. The public CLI reference is thinner (see [Source discrepancies](#source-discrepancies)).

Domain terms follow `CONTEXT.md`: the Platform wraps a **Harness** (the grok-build process) so the Operator can run a Feature's Guided Workflow (grill-with-docs → to-spec → to-tickets → implement).

---

## 1. Surfaces a wrapper can attach to

Grok Build documents three product entry points ([Getting Started](file:///home/micha/.grok/docs/user-guide/01-getting-started.md), [docs.x.ai/build/overview](https://docs.x.ai/build/overview)):

| Surface | Entry | Bidirectional? | Process model |
| --- | --- | --- | --- |
| Interactive TUI | `grok` | Yes (keyboard) | Long-lived pager |
| Headless one-shot | `grok -p` / `--single` | No (stdout stream is read-only) | One prompt, then exit |
| ACP agent | `grok agent {stdio,serve,headless,leader}` | Yes (JSON-RPC) | Long-lived server or subprocess |

The TUI is not a web-wrapper interface. The two official programmatic interfaces are **headless** and **ACP**.

There is no first-party hosted HTTP API that *is* Grok Build (the Harness). The xAI HTTP API (`https://api.x.ai/v1/responses` with `XAI_API_KEY`) exposes the same model family ([docs.x.ai/build/overview](https://docs.x.ai/build/overview#use-grok-46-on-the-api)) but is a different product path: the caller owns the agent loop, tools, sessions, and HITL. It is not the Harness.

---

## 2. ACP / `grok agent`

### 2.1 What ACP is

The [Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction.md) standardizes JSON-RPC between a Client (IDE, custom app) and a coding Agent. Local agents speak JSON-RPC over stdio. Remote agents over HTTP or WebSocket are described as suitable in principle; **full remote support is still work in progress** in the spec itself.

Grok's mapping ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#what-is-acp)):

- Sessions (create, load, resume)
- Prompts and streamed replies
- Tool-call updates
- Reasoning / thought streams
- Permission prompts when the session is not always-approve

Use ACP for "IDE or tool integration rather than a terminal session" ([docs.x.ai/build/cli/headless-scripting](https://docs.x.ai/build/cli/headless-scripting#acp)). Use `grok -p` for a one-shot that prints and exits ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md)).

### 2.2 Transports Grok actually ships

`grok agent --help` (1.0.3) lists four modes. Agent-wide flags go *before* the mode name; mode flags go after ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#stdio-transport)).

#### stdio

```bash
grok agent --always-approve stdio
```

JSON-RPC on stdin/stdout. This is the common local integration path and the only transport the ACP spec currently stabilizes ([ACP transports](https://agentclientprotocol.com/protocol/v1/transports.md): newline-delimited UTF-8 JSON-RPC; agent must not write non-ACP bytes to stdout; stderr is logs).

Typical clients: IDE extensions, custom tools, ACP SDKs ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#stdio-transport)).

A VPS web backend that already runs next to the Harness can spawn this subprocess and speak ACP without exposing a socket.

#### WebSocket server (`serve`)

```bash
grok agent --always-approve serve --bind 127.0.0.1:2419 --secret <token>
```

From `grok agent serve --help` and [15-agent-mode.md § Server mode](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#server-mode):

| Flag | Fact |
| --- | --- |
| `--bind` | Listen address. Default **`127.0.0.1:2419`** (localhost only). |
| `--secret` | Client auth token. Auto-generated at startup if omitted. Also `GROK_AGENT_SECRET`. |
| `--remote` | "Remote agent URL for proxy mode" (help text only; no further contract in the user guide). |
| `--grok-ws-url` / `--grok-ws-origin` | Present on the binary; undocumented beyond the flag names. |

Clients connect over WebSocket and authenticate with the secret. **The process keeps state across client reconnects.** Permissions match other entry points. "This is a server you run yourself — Grok's hosted cloud sandboxes do not run `grok agent serve`."

ACP's official transport list is stdio plus a *draft* Streamable HTTP; WebSocket is not a stable ACP transport ([ACP transports](https://agentclientprotocol.com/protocol/v1/transports.md)). Grok's `serve` is therefore a **Grok-specific custom transport** carrying ACP JSON-RPC, not a spec-standardized remote ACP.

The public CLI reference table lists `grok agent stdio` only ([docs.x.ai/build/cli/reference](https://docs.x.ai/build/cli/reference#subcommands)). `serve` / `headless` are documented in the local user guide and the binary.

#### WebSocket relay (`headless`)

```bash
grok agent --always-approve headless --grok-ws-url wss://your-relay.example.com/ws
```

"To reach the agent over the internet, connect the agent to a relay and point browsers at the same relay" ([15-agent-mode.md § WebSocket relay](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#websocket-relay)).

Enterprise network table: `code.grok.com` is "Remote session sync, sharing, WebSocket relay". Blocking it keeps sessions local-only ([docs.x.ai/build/enterprise](https://docs.x.ai/build/enterprise#network-requirements)). The user guide does not document a first-party hosted relay URL, message framing, or how a browser authenticates to the relay. `--grok-ws-url` is required in the example; the relay itself is "yours".

#### leader

`--leader` / `--no-leader` share one backend among clients via `~/.grok/leader.sock`. Refused when a non-`off` sandbox profile is requested ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#options), [18-sandbox.md](file:///home/micha/.grok/docs/user-guide/18-sandbox.md)). Off by default.

### 2.3 Session lifecycle

ACP requires `initialize` then session setup before any prompt ([Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn.md)).

**Initialize.** Client sends `protocolVersion` and `clientCapabilities` (optional `fs.readTextFile` / `fs.writeTextFile`, `terminal`, `elicitation`). Agent returns negotiated version, `agentCapabilities`, and `authMethods` ([Initialization](https://agentclientprotocol.com/protocol/v1/initialization.md)).

Grok's TypeScript example and the official scripting page both send `protocolVersion: 1` and filesystem/terminal client capabilities ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#integration-example-a-typescript-acp-client), [docs.x.ai/build/cli/headless-scripting](https://docs.x.ai/build/cli/headless-scripting#acp)).

**Authenticate (Grok).** After `initialize`, official example ([docs.x.ai/build/cli/headless-scripting](https://docs.x.ai/build/cli/headless-scripting#acp)):

1. Read `authMethods` from the initialize result.
2. Prefer `xai.api_key` if `XAI_API_KEY` is set and advertised; else `cached_token` if advertised.
3. If neither: "Run `grok login` first, or set `XAI_API_KEY`."
4. `authenticate` with `{ methodId, _meta: { headless: true } }`.

ACP `authenticate` itself is `{ methodId }` ([ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication.md)). `_meta.headless` is a Grok extension used in the official example.

Grok also advertises ACP extension methods `x.ai/auth/get_url` and `x.ai/auth/submit_code` ([15-agent-mode.md § Extension methods](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#extension-methods)). No request/response schema is published beyond those names. They sit next to the CLI device-code flow, but the user guide does not specify the wire contract.

**Create.** `session/new` with `cwd` (absolute path) and `mcpServers`. Agent returns `sessionId` ([ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup.md), [17-sessions.md § Agent stdio](file:///home/micha/.grok/docs/user-guide/17-sessions.md#agent-stdio-session-management)).

Grok `_meta` on `session/new` ([15-agent-mode.md § Session `_meta` options](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#session-_meta-options)):

| Field | Meaning |
| --- | --- |
| `rules` | Extra rules appended to the system prompt |
| `systemPromptOverride` | Replacement system prompt |
| `agentProfile` | Profile name or JSON object |
| `yoloMode` | `true` → always-approve for this session |
| `autoMode` | `true` → auto permission mode; superseded if always-approve is already on |

**Load (replay).** If `agentCapabilities.loadSession` is true, `session/load` restores the session and **replays the entire conversation** as `session/update` notifications, then returns ([ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup.md#loading-sessions)). Grok documents this method ([17-sessions.md](file:///home/micha/.grok/docs/user-guide/17-sessions.md#agent-stdio-session-management)). "The agent persists all session updates automatically. Clients can reconnect and load previous sessions by ID."

**Resume (no replay).** ACP v1 also defines `session/resume` behind `sessionCapabilities.resume`: restore context **without** replaying history ([ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup.md#resuming-sessions)). Grok's ACP overview *says* "Sessions (create, load, resume)" ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#what-is-acp)). The worked examples only show `session/new` and `session/load`. Whether Grok advertises `sessionCapabilities.resume` is discoverable from that agent's `initialize` response, which the user guide says to treat as the live catalog for `x.ai/*` as well.

**Close / delete / list.** ACP v1 has optional `session/close`, `session/delete`, `session/list`. Grok's user guide does not document calling them. `grok sessions list|search` exists as a CLI, not as ACP.

**Grok session extensions.** `x.ai/session/fork`, `x.ai/session/resolve_local_for_worktree_resume` ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#extension-methods)).

Sessions are the same on-disk objects in TUI, headless, and ACP ([17-sessions.md](file:///home/micha/.grok/docs/user-guide/17-sessions.md#what-sessions-are), [docs.x.ai/build/features/sessions](https://docs.x.ai/build/features/sessions)): `~/.grok/sessions/<encoded-cwd>/<session-id>/`, with `updates.jsonl` as the authoritative ACP update log.

### 2.4 Prompt streaming

Client sends `session/prompt` with `sessionId` and `prompt: ContentBlock[]` (at least text). Agent streams `session/update` notifications, then answers the original request with `{ stopReason }` ([ACP Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn.md), [docs.x.ai/build/cli/headless-scripting](https://docs.x.ai/build/cli/headless-scripting#acp): "`session/prompt` returns completion metadata; the assistant text itself arrives as `session/update` chunks").

Grok `sessionUpdate` values ([15-agent-mode.md § Streaming updates](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#streaming-updates)):

| `sessionUpdate` | What a client can render |
| --- | --- |
| `agent_message_chunk` | Assistant text chunk |
| `agent_thought_chunk` | Reasoning / thought chunk |
| `tool_call` | New tool invocation (title, kind, status, input) |
| `tool_call_update` | Status or result of an in-flight tool call |
| `plan` | Agent execution plan |

ACP also defines `user_message_chunk` (used on `session/load` replay) and optional `usage_update` (`used` / `size` tokens, optional `cost`) ([Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn.md)). Grok's table does not list those two; a client should still switch on `sessionUpdate` and ignore unknowns.

Stop reasons: `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled` ([Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn.md#stop-reasons)).

**Cancel.** Client may send `session/cancel`. It must then answer any pending `session/request_permission` with `outcome: cancelled`. Agent must finish with `stopReason: cancelled`, not an error ([Prompt Turn § Cancellation](https://agentclientprotocol.com/protocol/v1/prompt-turn.md#cancellation)).

After a turn completes, the Client may send another `session/prompt` on the same session.

### 2.5 Tool calls

Reported as `session/update` with `sessionUpdate: tool_call` / `tool_call_update` ([ACP tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls.md)). Fields a frontend can render:

- `toolCallId`, `title`, `kind` (`read` / `edit` / `delete` / `move` / `search` / `execute` / `think` / `fetch` / `other`)
- `status`: `pending` → `in_progress` → `completed` | `failed`
- `content[]`: text, **diffs** (`path`, `oldText`, `newText`), or a live **terminal** id
- `locations[]`: file path + optional line (follow-along)
- `rawInput` / `rawOutput`

Grok's headless projector reuses these leaf names (`toolCallId`, `kind`, `rawInput`, `rawOutput`) and adds `toolName` ([14-headless-mode.md](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#streaming-json)).

### 2.6 Permission prompts (HITL on tools)

When the session is not always-approve, the Agent **may** call `session/request_permission` before executing a tool ([ACP tool calls § Requesting permission](https://agentclientprotocol.com/protocol/v1/tool-calls.md#requesting-permission), [15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#what-is-acp)).

Request carries `sessionId`, a `toolCall` update, and `options[]` with `optionId`, `name`, and `kind`:

- `allow_once` / `allow_always`
- `reject_once` / `reject_always`

Client must reply `{ outcome: { outcome: "selected", optionId } }` or `{ outcome: { outcome: "cancelled" } }`.

This is a **JSON-RPC request from Agent to Client**. The Client (the wrapper) must stay connected and answer, or the turn blocks.

Always-approve skips ordinary permission prompts:

- CLI: `grok agent --always-approve …` (alias `--yolo`)
- Session: `_meta.yoloMode: true` on `session/new`

Deny rules, hooks, and some shell `ask` rules still apply ([22-permissions-and-safety.md](file:///home/micha/.grok/docs/user-guide/22-permissions-and-safety.md#always-approve)). Grok's own automation docs start from always-approve "so tools run without interactive permission prompts" ([15-agent-mode.md](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#automation-and-sdks)).

In **auto** mode, a blocked call in a non-interactive session **fails and is reported to the model**. Same behavior for `grok -p`, `agent stdio`, and `agent serve` ([22-permissions-and-safety.md § Auto mode](file:///home/micha/.grok/docs/user-guide/22-permissions-and-safety.md#auto-mode)). Auto is not a HITL channel.

### 2.7 Elicitation vs Grok `ask_user_question`

ACP v1 has `elicitation/create` (form or URL) if the Client advertised `clientCapabilities.elicitation` ([ACP elicitation](https://agentclientprotocol.com/protocol/v1/elicitation.md)). Grok's user-guide ACP chapter does **not** list elicitation among capabilities or extension methods.

Separately, Grok has a built-in tool `ask_user_question`:

- TUI: a **blocking card** that takes the keyboard until the Operator answers, dismisses (`Shift+X`), or the timeout fires ([03-keyboard-shortcuts.md § Blocking cards](file:///home/micha/.grok/docs/user-guide/03-keyboard-shortcuts.md#blocking-cards)).
- Default timeout 1800 s (30 min), configurable via `[toolset.ask_user_question]` / `GROK_ASK_USER_QUESTION_TIMEOUT_*` ([05-configuration.md](file:///home/micha/.grok/docs/user-guide/05-configuration.md#tool-configuration)).
- Plan mode "may use `ask_user_question` to clarify specific questions" ([19-plan-mode.md](file:///home/micha/.grok/docs/user-guide/19-plan-mode.md#what-plan-mode-does)).
- Plan *approval* (`exit_plan_mode`) is another TUI-only surface (keys `a` / `s` / `c` / `q`) ([19-plan-mode.md § Plan Approval](file:///home/micha/.grok/docs/user-guide/19-plan-mode.md#plan-approval)). File-edit gate of plan mode is **not** skipped under always-approve ([19-plan-mode.md](file:///home/micha/.grok/docs/user-guide/19-plan-mode.md#edits-during-plan-mode), [docs.x.ai/build/features/permissions](https://docs.x.ai/build/features/permissions)).

First-party sources do **not** document how `ask_user_question` or plan-approval map onto ACP methods. They do document that permission prompts map to `session/request_permission`, and that headless streams have no bidirectional channel (next section).

### 2.8 SDKs

Official ACP libraries (protocol project, not xAI-specific) are listed in [15-agent-mode.md § ACP SDKs](file:///home/micha/.grok/docs/user-guide/15-agent-mode.md#acp-sdks): TypeScript `@agentclientprotocol/sdk`, Rust `agent-client-protocol`, plus Python / Go / Kotlin.

---

## 3. Headless (`grok -p`) streams

Triggered by `-p` / `--single`, `--prompt-json`, or `--prompt-file`. One prompt, full tool access, stdout result, process exits ([14-headless-mode.md](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#basic-usage)). Does **not** read piped stdin into the prompt.

`--output-format`: `plain` | `json` | `streaming-json` | `streaming-messages-json` (`grok --help`; [14-headless-mode.md § Output Formats](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#output-formats)). Public docs currently list the first three only ([docs.x.ai/build/cli/headless-scripting](https://docs.x.ai/build/cli/headless-scripting#output-formats)).

### 3.1 What a frontend can render

**`json`** — one object after the turn. Fields: `text`, `stopReason` (ACP/Messages snake_case: `end_turn`, `max_tokens`, …), `sessionId`, `requestId`, optional `thought`, and spend (`usage`, `num_turns`, `modelUsage`, cost) when the prompt reached the model ([14-headless-mode.md § json](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#json)). `sessionId` is the resume handle.

**`streaming-json`** — NDJSON of ACP-derived events. Switch on `type` ([14-headless-mode.md § streaming-json](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#streaming-json)):

| `type` | Renderable |
| --- | --- |
| `text` | Assistant text chunk (`data`) |
| `thought` | Reasoning chunk (`data`) |
| `tool_call` | Start of a tool (`toolCallId`, `title`, `kind`, `status`, `toolName`, `rawInput`, `content`, `locations`) |
| `tool_call_update` | Progress / result (`status`, `rawOutput`, `content`, `locations`) |
| `plan` | Plan `entries` |
| `available_commands` | `tools`, `commands` |
| `usage` | Per-response tokens / `stopReason` / `signature` |
| `end` | Last event: `stopReason`, `sessionId`, `requestId`, spend |
| `error` | `message` (+ spend if any) |

Also possible, non-exhaustive: `max_turns_reached`, `auto_compact_*`. `end` is always last.

A UI can stream text, show thoughts, list in-flight tools with names/inputs/status, show a plan, and keep `sessionId` for the next process.

**`streaming-messages-json`** — NDJSON in the Anthropic Messages `stream-json` shape (`system/init`, `assistant` with `text`/`thinking`/`tool_use`, `user` with `tool_result`, terminal `result`). Intended so an existing Messages-API consumer can reconstruct messages, spend, and errors. Several fields are approximated or omitted (see fidelity notes in [14-headless-mode.md](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#streaming-messages-json)). `--include-partial-messages` adds `message_start` / `content_block_*` / `message_delta` / `message_stop` framing (coarser than token-level).

### 3.2 What is missing (HITL backchannel)

Quoted from the user guide, end of the `streaming-messages-json` section, applying to both streams:

> Like `streaming-json`, this stream is **read only**. Tool approvals and other bidirectional flows use the ACP interface (`grok agent`).
>
> — [14-headless-mode.md](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#streaming-messages-json)

Consequences that follow from the same document:

- No `session/request_permission` (or any other RPC) on the stream. A frontend cannot approve or reject a tool mid-turn.
- No documented way to answer `ask_user_question` or plan-approval over stdout.
- Headless does not read stdin as a conversation backchannel ([14-headless-mode.md § Standard Input](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#standard-input)).
- The process **exits** when the response is complete. The next Operator message is a **new process**.
- Mid-turn cancel is OS signal only: SIGINT → exit 130, SIGTERM → 143. State is saved up to the last completed tool call; file edits are not rolled back ([14-headless-mode.md § Interrupted Headless Runs](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#interrupted-headless-runs)).

Without `--always-approve` / `--yolo` / `--permission-mode bypassPermissions`, tools that need approval have no interactive surface. Auto mode denies blocked calls to the model. `dontAsk` silently denies anything without an allow rule ([22-permissions-and-safety.md](file:///home/micha/.grok/docs/user-guide/22-permissions-and-safety.md), [docs.x.ai/build/enterprise](https://docs.x.ai/build/enterprise#permissions)). Headless automation examples therefore pass `--yolo` / `--always-approve`.

### 3.3 Multi-turn on headless (turn boundary only)

Each `grok -p` starts a **new** session by default. Context across calls:

- Capture `sessionId` from `--output-format json` (or `end.sessionId` on the stream).
- Next process: `grok -p "…" --resume <id>` (`-r`). Errors if missing.
- Or `-c` / `--continue` for the most recent session in the cwd.

`-s` / `--session-id` **creates** a new UUID session; it does **not** resume (CLI help and [14-headless-mode.md](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#named-sessions--s-); the public scripting page still says "Create or resume" — see discrepancies).

That is **turn-boundary** follow-up: the previous process must have exited. It is not mid-turn HITL.

---

## 4. Auth: subscription login vs `XAI_API_KEY`

### 4.1 Two different credentials

Grok resolves credentials per request, highest wins ([02-authentication.md § Auth Precedence](file:///home/micha/.grok/docs/user-guide/02-authentication.md#auth-precedence), [docs.x.ai/build/enterprise](https://docs.x.ai/build/enterprise#authentication)):

1. Per-model `api_key` / `env_key` in `config.toml`
2. **Active session token** in `~/.grok/auth.json` (browser / device-code / OIDC / external provider)
3. **`XAI_API_KEY`** (fallback when no session token is active)

| | Session token (`grok login`) | `XAI_API_KEY` |
| --- | --- | --- |
| Source | grok.com / `auth.x.ai` OAuth, device-code, enterprise OIDC, or external provider | [console.x.ai](https://console.x.ai) |
| Stored | `~/.grok/auth.json` | Environment (or `model.*.api_key`) |
| Refreshable | **Yes** ([enterprise auth table](https://docs.x.ai/build/enterprise#authentication)) | **No** (same table) |
| When both exist | Session token wins. `grok logout` or delete `auth.json` to fall back ([02-authentication.md § API Key](file:///home/micha/.grok/docs/user-guide/02-authentication.md#api-key)) | Used only if no session token |
| What `/session-info` shows | OAuth vs API key; "API-key sessions also suggest `grok login` for SuperGrok" ([17-sessions.md](file:///home/micha/.grok/docs/user-guide/17-sessions.md#the-session-info-command)) | Same |

The Operator's **normal grok.com / SuperGrok subscription** is the session-token path (`grok login`), not a console API key. First-party docs never call the key a subscription; they call it the CI/automation fallback and mark it non-refreshable.

### 4.2 How login works on a headless VPS

Browser login (`grok` or `grok login`, default `--oauth`) opens a browser to SpaceXAI OAuth at `auth.x.ai` ([02-authentication.md](file:///home/micha/.grok/docs/user-guide/02-authentication.md#browser-login-default), `grok login --help`). That needs a local browser.

For SSH / Docker / remote VMs / no local browser:

```bash
grok login --device-auth    # alias: --device-code
```

Prints a URL and a short user code. Complete login on **any** device with a browser. Grok polls until confirmed. Documented as RFC 8628 ([02-authentication.md § Device Code Flow](file:///home/micha/.grok/docs/user-guide/02-authentication.md#device-code-flow), [docs.x.ai/build/enterprise § Device code](https://docs.x.ai/build/enterprise#device-code), [docs.x.ai/build/cli/reference](https://docs.x.ai/build/cli/reference)).

Same path is listed under headless authentication next to `XAI_API_KEY` ([14-headless-mode.md § Authentication for Headless Environments](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#authentication-for-headless-environments)).

ACP after that login: initialize advertises `cached_token`; client calls `authenticate` with that `methodId` ([docs.x.ai/build/cli/headless-scripting](https://docs.x.ai/build/cli/headless-scripting#acp)).

Grok also supports enterprise OIDC and an external `auth_provider_command` (stdout token contract, `GROK_AUTH_EXPIRED=1` for silent refresh). Those are IdP/CI mechanisms, not the default grok.com subscription ([02-authentication.md](file:///home/micha/.grok/docs/user-guide/02-authentication.md)).

### 4.3 `~/.grok/auth.json` and staying logged in

Facts from [02-authentication.md](file:///home/micha/.grok/docs/user-guide/02-authentication.md) and [01-getting-started.md](file:///home/micha/.grok/docs/user-guide/01-getting-started.md):

- After sign-in, credentials live in `~/.grok/auth.json` and are reused across TUI, headless, and ACP processes. Override the home with `GROK_HOME` ([14-headless-mode.md § File Locations](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#file-locations)).
- File mode is owner-only (`0600` on Unix). Anyone with filesystem access to that path can use the credentials. Do not copy `auth.json` into shared directories, tickets, or chat. Keep `$HOME` / `$GROK_HOME` private on multi-user hosts.
- **Grok refreshes access tokens automatically in the background.** When a token cannot be refreshed, Grok prompts to sign in again.
- Credentials **without a server-provided expiry fall back to a 30-day lifetime**.
- OIDC: silent refresh via stored `refresh_token`.
- External provider: Grok **re-runs the binary** to refresh (`GROK_AUTH_EXPIRED=1`, short timeout, no prompt). Not an OAuth refresh grant.
- **Hot reload:** changes to `auth.json` are picked up on the next API call without restarting Grok.
- `grok logout` clears the cached session.

The published sources do **not** document the JSON schema of `auth.json` (field names, whether a `refresh_token` is always present for grok.com OAuth). They document the file as auto-managed.

On a long-lived VPS that implication is:

1. Run `grok login --device-auth` once as the OS user that will run the Harness.
2. Leave `~/.grok` **writable** so refreshes and session files can be written. A read-only `~/.grok` is documented for CI: pre-populate `auth.json` or use `XAI_API_KEY`; "session persistence fails silently" ([14-headless-mode.md § Read-Only `~/.grok`](file:///home/micha/.grok/docs/user-guide/14-headless-mode.md#read-only-grok)).
3. As long as refresh succeeds, later `grok -p`, `grok agent stdio`, and `grok agent serve` reuse the same session token. No browser on the VPS.
4. When refresh fails (or the 30-day fallback expires with no refresh token), the Operator must run device-code again. There is no first-party "stay logged in forever without refresh" switch.
5. Do not substitute `XAI_API_KEY` if the goal is the grok.com subscription: the key is a different, non-refreshable credential and loses to any leftover `auth.json`.

### 4.4 Network the VPS must reach

All connections HTTPS/443, TLS 1.2 or 1.3, no disable switch ([docs.x.ai/build/enterprise § Network requirements](https://docs.x.ai/build/enterprise#network-requirements)):

| Host | Role |
| --- | --- |
| `cli-chat-proxy.grok.com` | Inference proxy and settings (required for the subscription/session-token path) |
| `auth.x.ai` | OAuth2 / OIDC / device-code (required to log in and to refresh that login) |
| `api.x.ai` | Direct API-key path only |
| `code.grok.com` | Remote session sync, sharing, WebSocket relay (optional) |

Proxy env vars (`HTTPS_PROXY`, …) are honored. Inference uses SSE; idle timeout default 600 s — set proxy idle timeouts to at least 10 minutes.

### 4.5 ACP authenticate vs CLI login

These are layered, not alternatives:

- **CLI `grok login`** fills `auth.json` (or `XAI_API_KEY` fills the env).
- **ACP `authenticate`** tells *that agent process* which advertised method to use (`cached_token` or `xai.api_key`).
- **`x.ai/auth/get_url` + `submit_code`** exist as Grok extensions for an in-band login; wire format is not in the user guide.

---

## 5. What of this can carry grill-with-docs (HITL) through implement

Guided Workflow stages are long, multi-turn, and will block on the Operator: clarifying questions, tool approvals, possibly plan review.

| Need | Headless `grok -p` | ACP `grok agent` |
| --- | --- | --- |
| Stream assistant text / thoughts / tools / plan to a web UI | Yes (`streaming-json` / `streaming-messages-json`) | Yes (`session/update`) |
| Same on-disk session across stages | Yes (`-r` / `-c`, `sessionId` from JSON) | Yes (`session/new` then `session/load`; same `~/.grok/sessions/`) |
| Follow-up after a turn ends | Yes (new process + `-r`) | Yes (another `session/prompt` on the live session) |
| Mid-turn tool permission (allow / deny) | **No.** Stream is read-only. Automation uses `--yolo`, which *skips* the prompt. | **Yes.** `session/request_permission` ↔ Client reply. |
| Mid-turn cancel | Signal only (130 / 143) | `session/cancel` + cancelled permission outcomes |
| `ask_user_question` (grill questions as a blocking tool) | No documented answer channel; default 30 min timeout then the tool gives up | Not documented as an ACP method. Will at least appear as a `tool_call` update; answering it is unspecified. |
| Plan-mode approval UI | TUI-only in the user guide | Not documented |
| Stay connected across browser reconnect | N/A (process is gone) | `serve`: process keeps state across reconnects; client then `session/load` (replay) or possibly `session/resume` |
| Operator subscription on a VPS | Device-code → `auth.json` → auto-refresh | Same `auth.json`, then ACP `authenticate` / `cached_token` |

Turn-boundary HITL (Harness writes a question into the assistant text, exits, wrapper sends the answer as the next `-p`) is possible on headless. Mid-turn HITL (permission card, question card, plan approval) is what the TUI implements as "blocking cards" ([03-keyboard-shortcuts.md](file:///home/micha/.grok/docs/user-guide/03-keyboard-shortcuts.md#blocking-cards)). Of those, **only tool permission is specified on ACP**. Headless documents that bidirectional flows are ACP-only.

Always-approve makes a wrapper runnable without implementing `session/request_permission`, at the cost of not having tool-level HITL. It does **not** implement `ask_user_question` or plan approval, and it does not remove deny rules / hooks / the plan-mode edit gate.

---

## Source discrepancies

Recorded so later work does not mix catalogs:

| Topic | Local user guide + `grok` 1.0.3 | docs.x.ai (fetched 2026-08-14) |
| --- | --- | --- |
| `-s` / `--session-id` | **Create-only** UUID; resume is `-r` / `-c` | Headless page: "Create or resume a named headless session" |
| Output formats | Four, including `streaming-messages-json` | Three: `plain`, `json`, `streaming-json` |
| `grok agent serve` / `headless` | Documented + in `--help` | CLI reference lists `grok agent stdio` only |
| ACP `_meta.yoloMode`, `x.ai/*` extensions, serve/reconnect | Local 15-agent-mode.md | Official ACP example is stdio + `authenticate` only |

Where they conflict, this note follows the **installed binary help** and the **local user guide**, and cites the public page when it agrees.

---

## Implications for the wrapper decision

Facts only.

**Possible**

- Drive the Harness from a VPS process by spawning `grok agent stdio` and speaking ACP JSON-RPC (spec-stable transport).
- Or run `grok agent serve` on `127.0.0.1:2419` (default) and connect a backend over WebSocket with `GROK_AGENT_SECRET` / `--secret`. State survives client reconnects. Binding is localhost unless changed.
- Or point `grok agent headless --grok-ws-url wss://…` at a relay the Operator operates; first-party docs do not ship the relay protocol.
- Render a live turn from ACP `session/update` (text, thoughts, tools, plan) or, for one-shot display only, from `streaming-json` / `streaming-messages-json`.
- Keep one Feature conversation as one Grok session ID on disk; resume via ACP `session/load` or headless `-r`.
- Implement tool-level HITL by answering `session/request_permission`. Skip that UI only by turning always-approve on (deny/hooks still apply).
- Keep the Operator's grok.com subscription on the VPS with `grok login --device-auth`, a private writable `~/.grok/auth.json`, and Grok's background refresh. ACP then authenticates as `cached_token`. Required egress: `auth.x.ai` and `cli-chat-proxy.grok.com`.

**Not possible / not specified by first-party sources**

- Use headless stdout as a HITL backchannel. The stream is read-only; the process exits after one prompt.
- Treat `XAI_API_KEY` as the subscription login. It is a non-refreshable console key and is ignored while `auth.json` holds a session token.
- Rely on a spec-stable ACP WebSocket. ACP's remote transport is draft; Grok `serve` is a Grok-specific socket.
- Assume Grok hosted sandboxes will run `grok agent serve` (explicitly they do not).
- Assume `ask_user_question` or plan-approval have a documented ACP or headless answer path. Only the TUI cards and a 30-minute question timeout are specified.
- Assume refresh never fails. No-expiry credentials fall back to 30 days; a failed refresh requires another device-code (or browser) login.
- Copy `auth.json` around as a deployment artifact (explicitly warned against).
- Use the public xAI HTTP API as a drop-in Harness: it is the model, not Grok Build's session/tool/permission runtime.
