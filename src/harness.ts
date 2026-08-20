import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DeviceCodeCeremony,
  HarnessAdapter,
  HarnessTurnRequest,
  SlotEvent,
} from "./platform.ts";

const STAGE_SKILLS = ["grill-with-docs", "to-spec", "to-tickets", "implement"] as const;
const SKILL_SOURCE = join(dirname(fileURLToPath(import.meta.url)), "skills");

export function createHarnessAdapter(options: {
  grokHome?: string;
  grokBin?: string;
} = {}): HarnessAdapter {
  const grokHome = options.grokHome ?? process.env.GROK_HOME ?? join(homedir(), ".grok");
  const grokBin = options.grokBin ?? process.env.GROK_BIN ?? "grok";
  let child: ChildProcessWithoutNullStreams | undefined;
  let ceremony: DeviceCodeCeremony | undefined;
  let output = "";
  let exitCode: number | null | undefined;
  const liveTurns = new Map<string, LiveTurn>();

  function authPath(): string {
    return join(grokHome, "auth.json");
  }

  async function hasSubscription(): Promise<boolean> {
    if (!existsSync(authPath())) {
      return false;
    }
    try {
      return readFileSync(authPath(), "utf8").trim().length > 0;
    } catch {
      return false;
    }
  }

  function grokEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, GROK_HOME: grokHome };
    delete env.XAI_API_KEY;
    return env;
  }

  function resetChild(): void {
    if (child && exitCode === undefined) {
      child.kill("SIGTERM");
    }
    child = undefined;
    ceremony = undefined;
    output = "";
    exitCode = undefined;
  }

  function attachOutput(process: ChildProcessWithoutNullStreams): void {
    const append = (chunk: Buffer | string) => {
      output += chunk.toString();
    };
    process.stdout.on("data", append);
    process.stderr.on("data", append);
    process.on("error", (error) => {
      output += `\n${error.message}`;
      exitCode = 1;
    });
    process.on("close", (code) => {
      exitCode = code;
    });
  }

  return {
    hasSubscription,
    async startDeviceCode() {
      if (await hasSubscription()) {
        return { ok: false, reason: "Subscription is already present." };
      }
      if (ceremony && child && exitCode === undefined) {
        return { ok: true, ceremony };
      }
      resetChild();
      const started = spawn(grokBin, ["login", "--device-auth"], { env: grokEnv() });
      child = started;
      attachOutput(started);
      const presented = await waitUntil(() => {
        const parsed = parseDeviceCodeOutput(output);
        if (parsed) {
          return parsed;
        }
        if (exitCode !== undefined) {
          return "exited" as const;
        }
        return undefined;
      }, 20_000);
      if (presented && presented !== "exited") {
        ceremony = presented;
        return { ok: true, ceremony: presented };
      }
      const reason =
        extractLastLine(output) ||
        (exitCode !== undefined
          ? "Device-code ceremony failed."
          : "Device-code ceremony did not present a URL and user code.");
      resetChild();
      return { ok: false, reason };
    },
    ensureStageSkills() {
      for (const name of STAGE_SKILLS) {
        const destDir = join(grokHome, "skills", name);
        mkdirSync(destDir, { recursive: true });
        copyFileSync(join(SKILL_SOURCE, name, "SKILL.md"), join(destDir, "SKILL.md"));
      }
    },
    async startTurn(request, onEvent) {
      if (liveTurns.has(request.cwd)) {
        return { ok: false, reason: "A Turn is already in flight." };
      }
      try {
        const turn = await spawnTurn(
          grokBin,
          grokEnv(),
          request,
          onEvent,
          (live) => {
            liveTurns.set(request.cwd, live);
          },
          () => {
            liveTurns.delete(request.cwd);
          },
        );
        return { ok: true, sessionId: turn.sessionId };
      } catch (error) {
        liveTurns.delete(request.cwd);
        return {
          ok: false,
          reason: error instanceof Error ? error.message : "Harness Turn failed to start.",
        };
      }
    },
    async cancelTurn(cwd) {
      const turn = liveTurns.get(cwd);
      if (!turn) {
        return { ok: false, reason: "No Turn is in flight." };
      }
      await turn.cancel();
      return { ok: true };
    },
    async loadHistory(cwd, sessionId) {
      const events: SlotEvent[] = [];
      const process = openAcp(grokBin, grokEnv(), cwd, (update) => {
        const event = mapSessionUpdate(update);
        if (event) {
          appendHistoryEvent(events, event);
        }
      });
      try {
        await initializeAcp(process);
        await process.request("session/load", { sessionId, cwd, mcpServers: [] });
        closeHistory(events);
        return events;
      } catch {
        closeHistory(events);
        return events;
      } finally {
        process.kill();
      }
    },
    async completeDeviceCode() {
      if (await hasSubscription()) {
        resetChild();
        return { ok: true };
      }
      if (!child) {
        return { ok: false, reason: "No Device-code ceremony is in progress." };
      }
      const finished = await waitUntil(async () => {
        if (await hasSubscription()) {
          return "ok" as const;
        }
        if (exitCode !== undefined) {
          return "exited" as const;
        }
        return undefined;
      }, 8_000);
      if (finished === "ok" || (await hasSubscription())) {
        resetChild();
        return { ok: true };
      }
      if (exitCode !== undefined && exitCode !== 0) {
        const reason = extractLastLine(output) || "Device-code ceremony failed.";
        resetChild();
        return { ok: false, reason };
      }
      return { ok: false, reason: "Device-code authorization is still pending." };
    },
  };
}

function parseDeviceCodeOutput(text: string): DeviceCodeCeremony | undefined {
  const urlMatch = text.match(/https:\/\/[^\s]+/);
  if (!urlMatch) {
    return undefined;
  }
  const verificationUrl = urlMatch[0].replace(/[.,)]+$/, "");
  const fromQuery = verificationUrl.match(/[?&]user_code=([A-Za-z0-9-]+)/i);
  const fromConfirm = text.match(/Confirm this code[^\n]*\n+\s*([A-Za-z0-9-]+)/i);
  const userCode = fromQuery?.[1] ?? fromConfirm?.[1];
  if (!userCode) {
    return undefined;
  }
  return { verificationUrl, userCode };
}

function extractLastLine(text: string): string | undefined {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .at(-1);
  return line && !line.startsWith("https://") ? line : undefined;
}

function waitUntil<T>(
  probe: () => T | Promise<T | undefined> | undefined,
  timeoutMs: number,
): Promise<T | undefined> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      const value = await probe();
      if (value !== undefined) {
        resolve(value);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(undefined);
        return;
      }
      setTimeout(() => {
        void tick();
      }, 50);
    };
    void tick();
  });
}

type JsonRpc = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
};

type AcpProcess = {
  request(method: string, params: unknown): Promise<unknown>;
  notify(method: string, params: unknown): void;
  send(method: string, params: unknown, onSettled: (result: unknown, error?: string) => void): void;
  kill(): void;
};

type LiveTurn = {
  sessionId: string;
  cancel(): Promise<void>;
};

function openAcp(
  grokBin: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  onUpdate: (update: unknown) => void,
  alwaysApprove = true,
): AcpProcess {
  const args = ["agent"];
  if (alwaysApprove) {
    args.push("--always-approve");
  }
  args.push("stdio");
  const child = spawn(grokBin, args, { cwd, env });
  let nextId = 1;
  let buffer = "";
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  function sendMessage(message: object): void {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function handle(message: JsonRpc): void {
    if (message.method === "session/update") {
      const params = message.params as { update?: unknown } | undefined;
      onUpdate(params?.update ?? message.params);
      return;
    }
    if (message.method === "session/request_permission") {
      const params = message.params as { options?: { kind?: string; optionId?: string }[] };
      const allow = params.options?.find(
        (option) => option.kind === "allow_always" || option.kind === "allow_once",
      );
      sendMessage({
        jsonrpc: "2.0",
        id: message.id,
        result: allow
          ? { outcome: { outcome: "selected", optionId: allow.optionId } }
          : { outcome: { outcome: "cancelled" } },
      });
      return;
    }
    if (message.method === "fs/read_text_file" || message.method === "fs/readTextFile") {
      const params = message.params as { path?: string };
      try {
        sendMessage({
          jsonrpc: "2.0",
          id: message.id,
          result: { content: readFileSync(params.path ?? "", "utf8") },
        });
      } catch (error) {
        sendMessage({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32000, message: error instanceof Error ? error.message : "read failed" },
        });
      }
      return;
    }
    if (message.method === "fs/write_text_file" || message.method === "fs/writeTextFile") {
      const params = message.params as { path?: string; content?: string };
      try {
        writeFileSync(params.path ?? "", params.content ?? "");
        sendMessage({ jsonrpc: "2.0", id: message.id, result: {} });
      } catch (error) {
        sendMessage({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32000, message: error instanceof Error ? error.message : "write failed" },
        });
      }
      return;
    }
    if (message.id === undefined) {
      return;
    }
    const waiter = pending.get(Number(message.id));
    if (!waiter) {
      return;
    }
    pending.delete(Number(message.id));
    if (message.error) {
      waiter.reject(new Error(message.error.message || "Harness request failed."));
      return;
    }
    waiter.resolve(message.result);
  }

  child.stdout.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          handle(JSON.parse(line) as JsonRpc);
        } catch {
          // ignore non-JSON
        }
      }
      newline = buffer.indexOf("\n");
    }
  });
  child.on("error", (error) => {
    for (const waiter of pending.values()) {
      waiter.reject(error);
    }
    pending.clear();
  });
  child.on("close", () => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error("Harness process exited."));
    }
    pending.clear();
  });

  return {
    request(method, params) {
      return new Promise((resolve, reject) => {
        const id = nextId;
        nextId += 1;
        pending.set(id, { resolve, reject });
        sendMessage({ jsonrpc: "2.0", id, method, params });
      });
    },
    notify(method, params) {
      sendMessage({ jsonrpc: "2.0", method, params });
    },
    send(method, params, onSettled) {
      const id = nextId;
      nextId += 1;
      pending.set(id, {
        resolve: (result) => onSettled(result),
        reject: (error) => onSettled(undefined, error.message),
      });
      sendMessage({ jsonrpc: "2.0", id, method, params });
    },
    kill() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    },
  };
}

async function initializeAcp(process: AcpProcess): Promise<void> {
  const result = (await process.request("initialize", {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
    },
  })) as { authMethods?: { id?: string }[] };
  const cached = result.authMethods?.some((method) => method.id === "cached_token");
  if (cached) {
    await process.request("authenticate", { methodId: "cached_token", _meta: { headless: true } });
  }
}

async function spawnTurn(
  grokBin: string,
  env: NodeJS.ProcessEnv,
  request: HarnessTurnRequest,
  onEvent: (event: SlotEvent) => void,
  onLive: (turn: LiveTurn) => void,
  onDone: () => void,
): Promise<LiveTurn> {
  let ended = false;
  let forwarding = false;
  let sessionId = request.sessionId ?? "";
  const process = openAcp(
    grokBin,
    env,
    request.cwd,
    (update) => {
      if (!forwarding || ended) {
        return;
      }
      const event = mapSessionUpdate(update);
      if (event && event.kind !== "prompt") {
        onEvent(event);
      }
    },
    request.alwaysApprove,
  );

  function finish(stopReason: string): void {
    if (ended) {
      return;
    }
    ended = true;
    forwarding = false;
    onEvent({ kind: "turn_ended", stopReason });
    process.kill();
    onDone();
  }

  const turn: LiveTurn = {
    get sessionId() {
      return sessionId;
    },
    async cancel() {
      if (sessionId) {
        process.notify("session/cancel", { sessionId });
      }
      const closed = await waitUntil(() => (ended ? true : undefined), 4_000);
      if (!closed) {
        finish("cancelled");
      }
    },
  };
  onLive(turn);

  try {
    await initializeAcp(process);
    if (ended) {
      return turn;
    }
    if (sessionId) {
      await process.request("session/load", { sessionId, cwd: request.cwd, mcpServers: [] });
    } else {
      const created = (await process.request("session/new", {
        cwd: request.cwd,
        mcpServers: [],
        _meta: {
          yoloMode: true,
          rules: request.rules,
        },
      })) as { sessionId?: string };
      if (!created.sessionId) {
        throw new Error("Harness did not return a session identity.");
      }
      sessionId = created.sessionId;
    }
    if (ended) {
      return turn;
    }
    forwarding = true;
    process.send(
      "session/prompt",
      { sessionId, prompt: [{ type: "text", text: request.prompt }] },
      (result) => {
        const stop =
          result && typeof result === "object" && "stopReason" in result
            ? String((result as { stopReason: unknown }).stopReason)
            : "end_turn";
        finish(stop);
      },
    );
    return turn;
  } catch (error) {
    if (ended) {
      return turn;
    }
    process.kill();
    onDone();
    throw error;
  }
}

function historyIsOpen(events: SlotEvent[]): boolean {
  const last = events.at(-1);
  return last !== undefined && last.kind !== "turn_ended";
}

function appendHistoryEvent(events: SlotEvent[], event: SlotEvent): void {
  if (event.kind === "prompt" && historyIsOpen(events)) {
    events.push({ kind: "turn_ended", stopReason: "end_turn" });
  }
  events.push(event);
}

function closeHistory(events: SlotEvent[]): void {
  if (historyIsOpen(events)) {
    events.push({ kind: "turn_ended", stopReason: "end_turn" });
  }
}

function mapSessionUpdate(update: unknown): SlotEvent | undefined {
  if (!update || typeof update !== "object") {
    return undefined;
  }
  const body = update as {
    sessionUpdate?: string;
    content?: { text?: string };
    title?: string;
    toolCallId?: string;
  };
  if (body.sessionUpdate === "user_message_chunk" && typeof body.content?.text === "string") {
    return { kind: "prompt", text: body.content.text };
  }
  if (body.sessionUpdate === "agent_message_chunk" && typeof body.content?.text === "string") {
    return { kind: "text", text: body.content.text };
  }
  if (body.sessionUpdate === "agent_thought_chunk" && typeof body.content?.text === "string") {
    return { kind: "reasoning", text: body.content.text };
  }
  if (body.sessionUpdate === "tool_call" || body.sessionUpdate === "tool_call_update") {
    const title = typeof body.title === "string" ? body.title : "";
    const id = typeof body.toolCallId === "string" ? body.toolCallId : undefined;
    if (!title && !id) {
      return undefined;
    }
    return id ? { kind: "tool_call", title, id } : { kind: "tool_call", title };
  }
  return undefined;
}
