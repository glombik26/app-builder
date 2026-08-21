import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createGitAdapter } from "../src/git.ts";

function git(
  cwd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "" },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function newRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "ticket-commit-"));
  assert.equal((await git(dir, ["init"])).code, 0);
  assert.equal((await git(dir, ["config", "user.name", "tester"])).code, 0);
  assert.equal((await git(dir, ["config", "user.email", "tester@example.com"])).code, 0);
  writeFileSync(join(dir, "README.md"), "hi\n");
  assert.equal((await git(dir, ["add", "README.md"])).code, 0);
  assert.equal((await git(dir, ["commit", "-m", "init"])).code, 0);
  return dir;
}

describe("GitAdapter commitWorktree", () => {
  it("stages non-ignored changes and commits as the given identity with the Ticket name", async () => {
    const worktree = await newRepo();
    writeFileSync(join(worktree, "app.ts"), "export const n = 1;\n");
    writeFileSync(join(worktree, ".gitignore"), ".scratch/\n.env\n");
    writeFileSync(join(worktree, ".env"), "SECRET=1\n");
    mkdirSync(join(worktree, ".scratch", "issues"), { recursive: true });
    writeFileSync(join(worktree, ".scratch", "issues", "login.md"), "# login\n");

    const result = await createGitAdapter().commitWorktree({
      worktree,
      message: "login.md",
      author: { name: "Platform", email: "platform@app-builder" },
    });

    assert.deepEqual(result, { ok: true, committed: true });
    const log = await git(worktree, ["log", "-1", "--format=%s%n%an%n%ae"]);
    assert.equal(log.stdout, "login.md\nPlatform\nplatform@app-builder\n");
    const show = await git(worktree, ["show", "--name-only", "--pretty=format:", "HEAD"]);
    assert.match(show.stdout, /^app\.ts$/m);
    assert.match(show.stdout, /^\.gitignore$/m);
    assert.equal(/^\.env$/m.test(show.stdout), false);
    assert.equal(/^\.scratch\//m.test(show.stdout), false);
    const remotes = await git(worktree, ["remote"]);
    assert.equal(remotes.stdout.trim(), "");
    const upstream = await git(worktree, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
    assert.notEqual(upstream.code, 0);
  });

  it("writes no commit when there is no diff", async () => {
    const worktree = await newRepo();
    const before = await git(worktree, ["rev-parse", "HEAD"]);
    const result = await createGitAdapter().commitWorktree({
      worktree,
      message: "login.md",
      author: { name: "Platform", email: "platform@app-builder" },
    });
    assert.deepEqual(result, { ok: true, committed: false });
    const after = await git(worktree, ["rev-parse", "HEAD"]);
    assert.equal(after.stdout, before.stdout);
  });

  it("leaves an already-tracked secret path in the commit and does not refuse", async () => {
    const worktree = await newRepo();
    writeFileSync(join(worktree, ".env"), "SECRET=old\n");
    assert.equal((await git(worktree, ["add", "-f", ".env"])).code, 0);
    assert.equal((await git(worktree, ["commit", "-m", "track env"])).code, 0);
    writeFileSync(join(worktree, ".gitignore"), ".env\n");
    writeFileSync(join(worktree, ".env"), "SECRET=new\n");
    writeFileSync(join(worktree, "app.ts"), "export {}\n");

    const result = await createGitAdapter().commitWorktree({
      worktree,
      message: "login.md",
      author: { name: "Platform", email: "platform@app-builder" },
    });
    assert.deepEqual(result, { ok: true, committed: true });
    const show = await git(worktree, ["show", "--name-only", "--pretty=format:", "HEAD"]);
    assert.match(show.stdout, /^\.env$/m);
    assert.match(show.stdout, /^app\.ts$/m);
  });

  it("stacks a second close as another commit without amending", async () => {
    const worktree = await newRepo();
    const adapter = createGitAdapter();
    writeFileSync(join(worktree, "one.ts"), "1\n");
    assert.deepEqual(
      await adapter.commitWorktree({
        worktree,
        message: "login.md",
        author: { name: "Platform", email: "platform@app-builder" },
      }),
      { ok: true, committed: true },
    );
    const first = (await git(worktree, ["rev-parse", "HEAD"])).stdout.trim();
    writeFileSync(join(worktree, "two.ts"), "2\n");
    assert.deepEqual(
      await adapter.commitWorktree({
        worktree,
        message: "login.md",
        author: { name: "Platform", email: "platform@app-builder" },
      }),
      { ok: true, committed: true },
    );
    const log = await git(worktree, ["log", "--format=%H %s"]);
    const lines = log.stdout.trim().split("\n");
    assert.equal(lines[0]?.endsWith(" login.md"), true);
    assert.equal(lines[1]?.startsWith(first), true);
    assert.equal(lines[1]?.endsWith(" login.md"), true);
    assert.equal(lines.length, 3);
  });
});
