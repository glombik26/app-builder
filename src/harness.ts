import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DeviceCodeCeremony, HarnessAdapter } from "./platform.ts";

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
