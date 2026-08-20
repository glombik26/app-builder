import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { GitAdapter, GitCloneResult, GitWorktreeStatus } from "./platform.ts";

export function createGitAdapter(): GitAdapter {
  return {
    async clonePublic({ owner, name, dest }) {
      const url = publicGithubUrl(owner, name);
      const cloned = await cloneBare(url, dest);
      if (!cloned.ok) {
        return cloned.reason === "Repository has no default branch."
          ? cloned
          : { ok: false, reason: publicCloneReason(cloned.reason) };
      }
      return cloned;
    },
    async cloneWithPat({ owner, name, dest, credential }) {
      const origin = publicGithubUrl(owner, name);
      const cloned = await cloneBare(authenticatedGithubUrl(owner, name, credential), dest);
      if (!cloned.ok) {
        if (cloned.reason === "Repository has no default branch.") {
          return cloned;
        }
        return { ok: false, reason: patCloneReason(redactCredential(cloned.reason, credential)) };
      }
      const reset = await runGit(["-C", dest, "remote", "set-url", "origin", origin]);
      if (!reset.ok) {
        rmSync(dest, { recursive: true, force: true });
        return { ok: false, reason: redactCredential(reset.reason, credential) };
      }
      return { ok: true };
    },
    async checkPat({ owner, name, credential }) {
      const checked = await runGit([
        "-c",
        "credential.helper=",
        "ls-remote",
        authenticatedGithubUrl(owner, name, credential),
      ]);
      if (!checked.ok) {
        return { ok: false, reason: patCloneReason(redactCredential(checked.reason, credential)) };
      }
      return { ok: true };
    },
    async addFeatureWorktree({ clone, branch, worktree, startPoint = "HEAD" }) {
      mkdirSync(dirname(worktree), { recursive: true });
      const added = await runGit([
        "-C",
        clone,
        "worktree",
        "add",
        "-b",
        branch,
        worktree,
        startPoint,
      ]);
      if (!added.ok) {
        rmSync(worktree, { recursive: true, force: true });
        await runGit(["-C", clone, "branch", "-D", branch]);
        return added;
      }
      return { ok: true };
    },
    async removeFeatureWorktree({ clone, branch, worktree }) {
      const removed = await runGit(["-C", clone, "worktree", "remove", "--force", worktree]);
      rmSync(worktree, { recursive: true, force: true });
      await runGit(["-C", clone, "worktree", "prune"]);
      const deleted = await runGit(["-C", clone, "branch", "-D", branch]);
      if (!removed.ok && !deleted.ok) {
        return { ok: false, reason: removed.reason };
      }
      return { ok: true };
    },
    async worktreeStatus({ worktree }): Promise<GitWorktreeStatus> {
      const status = await runGit(["-C", worktree, "status", "--porcelain"]);
      if (!status.ok) {
        return status;
      }
      return { ok: true, dirty: status.stdout.trim().length > 0 };
    },
  };
}

async function cloneBare(url: string, dest: string): Promise<GitCloneResult> {
  const cloned = await runGit(["-c", "credential.helper=", "clone", "--bare", url, dest]);
  if (!cloned.ok) {
    return cloned;
  }
  const head = await runGit(["-C", dest, "rev-parse", "--verify", "HEAD"]);
  if (!head.ok) {
    rmSync(dest, { recursive: true, force: true });
    return { ok: false, reason: "Repository has no default branch." };
  }
  return { ok: true };
}

function publicGithubUrl(owner: string, name: string): string {
  return `https://github.com/${owner}/${name}.git`;
}

function authenticatedGithubUrl(owner: string, name: string, credential: string): string {
  return `https://x-access-token:${encodeURIComponent(credential)}@github.com/${owner}/${name}.git`;
}

function redactCredential(reason: string, credential: string): string {
  let redacted = reason;
  for (const secret of [credential, encodeURIComponent(credential)]) {
    if (secret.length > 0) {
      redacted = redacted.split(secret).join("***");
    }
  }
  return redacted.replace(/x-access-token:[^@\s]+@/gi, "x-access-token:***@");
}

function patCloneReason(reason: string): string {
  if (isGitAuthFailure(reason)) {
    return "PAT was rejected or the repository was not found.";
  }
  return reason;
}

function runGit(args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      env: gitEnv(),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      resolve({ ok: false, reason: error.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, stdout: Buffer.concat(stdout).toString("utf8") });
        return;
      }
      const detail = Buffer.concat(stderr).toString("utf8").trim().split("\n").at(-1) ?? "";
      const reason = detail.replace(/^fatal:\s*/i, "").trim() || "git failed";
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
  if (isGitAuthFailure(reason)) {
    return "Repository not found or is private.";
  }
  return reason;
}

function isGitAuthFailure(reason: string): boolean {
  return /could not read Username|terminal prompts disabled|Authentication failed|could not read Password|invalid username or password/i.test(
    reason,
  );
}
