import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { GitAdapter, GitCloneResult, GitCommitResult, GitWorktreeStatus } from "./platform.ts";

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
    async commitWorktree({ worktree, message, author }): Promise<GitCommitResult> {
      const added = await runGit(["-C", worktree, "add", "-A"]);
      if (!added.ok) {
        return added;
      }
      const staged = await runGitCode(["-C", worktree, "diff", "--cached", "--quiet"]);
      if (staged.code === 0) {
        return { ok: true, committed: false };
      }
      if (staged.code !== 1) {
        return {
          ok: false,
          reason: staged.reason || "git diff --cached failed",
        };
      }
      const committed = await runGit(
        [
          "-C",
          worktree,
          "-c",
          `user.name=${author.name}`,
          "-c",
          `user.email=${author.email}`,
          "commit",
          "-m",
          message,
        ],
        {
          GIT_AUTHOR_NAME: author.name,
          GIT_AUTHOR_EMAIL: author.email,
          GIT_COMMITTER_NAME: author.name,
          GIT_COMMITTER_EMAIL: author.email,
        },
      );
      if (!committed.ok) {
        return committed;
      }
      return { ok: true, committed: true };
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

function runGit(
  args: string[],
  extraEnv?: NodeJS.ProcessEnv,
): Promise<{ ok: true; stdout: string } | { ok: false; reason: string }> {
  return runGitCode(args, extraEnv).then((result) => {
    if (result.code === 0) {
      return { ok: true, stdout: result.stdout };
    }
    return { ok: false, reason: result.reason };
  });
}

function runGitCode(
  args: string[],
  extraEnv?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; reason: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      env: { ...gitEnv(), ...extraEnv },
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
      resolve({ code: 1, stdout: "", reason: error.message });
    });
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const detail = Buffer.concat(stderr).toString("utf8").trim().split("\n").at(-1) ?? "";
      const reason = detail.replace(/^fatal:\s*/i, "").trim() || "git failed";
      resolve({ code: code ?? 1, stdout: output, reason });
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
