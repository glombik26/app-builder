import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createHarnessAdapter } from "../src/harness.ts";
import type { SlotEvent } from "../src/platform.ts";

const FAKE_GROK = `#!/usr/bin/env node
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\\n");
  while (newline !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) {
      handle(JSON.parse(line));
    }
    newline = buffer.indexOf("\\n");
  }
});

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}

function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true } } });
    return;
  }
  if (method === "session/new") {
    if (!Array.isArray(params?.mcpServers)) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Invalid params", data: "missing field \`mcpServers\`" },
      });
      return;
    }
    send({ jsonrpc: "2.0", id, result: { sessionId: "sess-1" } });
    return;
  }
  if (method === "session/load") {
    if (!Array.isArray(params?.mcpServers)) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Invalid params", data: "missing field \`mcpServers\`" },
      });
      return;
    }
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: { sessionUpdate: "user_message_chunk", content: { type: "text", text: "hello" } },
      },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: {
          sessionUpdate: "tool_call",
          title: "read_file",
          toolCallId: "call-1",
        },
      },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
      },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: { sessionUpdate: "user_message_chunk", content: { type: "text", text: "continue" } },
      },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "later" } },
      },
    });
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "session/prompt") {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } },
      },
    });
    send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } });
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: "2.0", id, result: {} });
  }
}
`;

function fakeGrokHome(): { grokHome: string; grokBin: string; cwd: string } {
  const grokHome = mkdtempSync(join(tmpdir(), "harness-grok-"));
  const cwd = mkdtempSync(join(tmpdir(), "harness-cwd-"));
  const grokBin = join(grokHome, "grok");
  writeFileSync(grokBin, FAKE_GROK);
  chmodSync(grokBin, 0o755);
  return { grokHome, grokBin, cwd };
}

async function runTurn(
  harness: ReturnType<typeof createHarnessAdapter>,
  request: Parameters<ReturnType<typeof createHarnessAdapter>["startTurn"]>[0],
): Promise<{ ok: true; sessionId: string; events: SlotEvent[] } | { ok: false; reason: string }> {
  const events: SlotEvent[] = [];
  let settle!: () => void;
  const ended = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const started = await harness.startTurn(request, (event) => {
    events.push(event);
    if (event.kind === "turn_ended") {
      settle();
    }
  });
  if (!started.ok) {
    return started;
  }
  await ended;
  return { ok: true, sessionId: started.sessionId, events };
}

describe("createHarnessAdapter", () => {
  it("loads an existing session on a follow-up Turn and when replaying history", async () => {
    const { grokHome, grokBin, cwd } = fakeGrokHome();
    const harness = createHarnessAdapter({ grokHome, grokBin });
    const request = {
      cwd,
      prompt: "hello",
      alwaysApprove: true as const,
      rules: "answer after the turn ends",
    };

    const first = await runTurn(harness, request);
    assert.equal(first.ok, true);
    if (!first.ok) {
      return;
    }

    const followUp = await runTurn(harness, { ...request, prompt: "continue", sessionId: first.sessionId });
    assert.deepEqual(followUp, {
      ok: true,
      sessionId: first.sessionId,
      events: [
        { kind: "text", text: "ok" },
        { kind: "turn_ended", stopReason: "end_turn" },
      ],
    });

    assert.deepEqual(await harness.loadHistory(cwd, first.sessionId), [
      { kind: "prompt", text: "hello" },
      { kind: "tool_call", title: "read_file", id: "call-1" },
      { kind: "text", text: "hi" },
      { kind: "turn_ended", stopReason: "end_turn" },
      { kind: "prompt", text: "continue" },
      { kind: "text", text: "later" },
      { kind: "turn_ended", stopReason: "end_turn" },
    ]);
  });
});
