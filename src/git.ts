import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import type { GitAdapter, GitCloneResult } from "./platform.ts";

export function createGitAdapter(): GitAdapter {
  return {
    async clonePublic({ owner, name, dest }) {
      const url = `https://github.com/${owner}/${name}.git`;
      const cloned = await runGit(["-c", "credential.helper=", "clone", "--bare", url, dest]);
      if (!cloned.ok) {
        return { ok: false, reason: publicCloneReason(cloned.reason) };
      }
      const head = await runGit(["-C", dest, "rev-parse", "--verify", "HEAD"]);
      if (!head.ok) {
        rmSync(dest, { recursive: true, force: true });
        return { ok: false, reason: "Repository has no default branch." };
      }
      return { ok: true };
    },
  };
}

function runGit(args: string[]): Promise<GitCloneResult> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      env: gitEnv(),
    });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      resolve({ ok: false, reason: error.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      const detail = Buffer.concat(stderr).toString("utf8").trim().split("\n").at(-1) ?? "";
      const reason = detail.replace(/^fatal:\s*/i, "").trim() || "git clone failed";
      resolve({ ok: false, reason });
    });
  });
}

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "" };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  delete env.GH_ENTERPRISE_TOKEN;
  return env;
}

function publicCloneReason(reason: string): string {
  if (/could not read Username|terminal prompts disabled|Authentication failed|could not read Password/i.test(reason)) {
    return "Repository not found or is private.";
  }
  return reason;
}
