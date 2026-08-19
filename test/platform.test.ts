import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  createPlatform,
  emptyAdapters,
  type GitAdapter,
  type GitCloneRequest,
} from "../src/platform.ts";

function newHome(): string {
  return mkdtempSync(join(tmpdir(), "platform-home-"));
}

function platformWithGit(home: string, git: GitAdapter) {
  return createPlatform({
    home,
    adapters: { ...emptyAdapters(), git },
  });
}

function succeedingGit(onClone?: (request: GitCloneRequest) => void): GitAdapter {
  return {
    async clonePublic(request) {
      onClone?.(request);
      return writeClone(request);
    },
    async cloneWithPat(request) {
      onClone?.(request);
      return writeClone(request);
    },
    async checkPat() {
      return { ok: true };
    },
  };
}

function writeClone(request: GitCloneRequest): { ok: true } | { ok: false; reason: string } {
  if (!existsSync(dirname(request.dest))) {
    return { ok: false, reason: "parent does not exist" };
  }
  mkdirSync(request.dest, { recursive: true });
  return { ok: true };
}

function unusedGit(reason = "should not clone"): GitAdapter {
  return {
    async clonePublic() {
      return { ok: false, reason };
    },
    async cloneWithPat() {
      return { ok: false, reason };
    },
    async checkPat() {
      return { ok: false, reason };
    },
  };
}

describe("Platform", () => {
  it("lists no Projects on a new home", () => {
    const platform = createPlatform({ home: newHome(), adapters: emptyAdapters() });
    assert.deepEqual(platform.listProjects(), []);
  });

  it("shows the same empty Project list from a second Platform on the same home", () => {
    const home = newHome();
    const first = createPlatform({ home, adapters: emptyAdapters() });
    assert.deepEqual(first.listProjects(), []);

    const second = createPlatform({ home, adapters: emptyAdapters() });
    assert.deepEqual(second.listProjects(), first.listProjects());
  });

  it("adds a public Project by GitHub URL after cloning the default branch with no credential", async () => {
    const clones: GitCloneRequest[] = [];
    const platform = platformWithGit(newHome(), succeedingGit((request) => clones.push(request)));

    const result = await platform.addProject("https://github.com/acme/widgets");

    assert.deepEqual(result, { ok: true, project: { owner: "acme", name: "widgets" } });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "widgets" }]);
    assert.equal(clones.length, 1);
    assert.equal(clones[0]?.owner, "acme");
    assert.equal(clones[0]?.name, "widgets");
    assert.equal("credential" in clones[0]!, false);
  });

  it("keeps a failed clone off the list and shows why", async () => {
    const platform = platformWithGit(newHome(), {
      ...unusedGit(),
      async clonePublic() {
        return { ok: false, reason: "Repository not found." };
      },
    });

    const result = await platform.addProject("https://github.com/acme/missing");

    assert.deepEqual(result, { ok: false, reason: "Repository not found." });
    assert.deepEqual(platform.listProjects(), []);
  });

  it("does not leave a clone after a failed add, so a later add of the same identity can succeed", async () => {
    const home = newHome();
    let attempts = 0;
    const platform = platformWithGit(home, {
      ...unusedGit(),
      async clonePublic(request) {
        if (existsSync(request.dest)) {
          return { ok: false, reason: "destination exists" };
        }
        attempts += 1;
        mkdirSync(request.dest, { recursive: true });
        if (attempts === 1) {
          return { ok: false, reason: "network down" };
        }
        return { ok: true };
      },
    });

    const failed = await platform.addProject("https://github.com/acme/widgets");
    assert.deepEqual(failed, { ok: false, reason: "network down" });
    assert.deepEqual(platform.listProjects(), []);

    const retry = await platform.addProject("https://github.com/acme/widgets");
    assert.deepEqual(retry, { ok: true, project: { owner: "acme", name: "widgets" } });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "widgets" }]);
  });

  it("refuses a second add of the same owner/name", async () => {
    let cloneCount = 0;
    const platform = platformWithGit(
      newHome(),
      succeedingGit(() => {
        cloneCount += 1;
      }),
    );

    const first = await platform.addProject("https://github.com/acme/widgets");
    assert.equal(first.ok, true);

    const second = await platform.addProject("https://github.com/acme/widgets.git");
    assert.deepEqual(second, {
      ok: false,
      reason: "A Project acme/widgets already exists.",
    });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "widgets" }]);
    assert.equal(cloneCount, 1);
  });

  it("refuses the same owner/name regardless of letter case", async () => {
    const platform = platformWithGit(newHome(), succeedingGit());
    const first = await platform.addProject("https://github.com/Acme/Widgets");
    assert.equal(first.ok, true);

    const second = await platform.addProject("https://github.com/acme/widgets");
    assert.deepEqual(second, {
      ok: false,
      reason: "A Project Acme/Widgets already exists.",
    });
    assert.deepEqual(platform.listProjects(), [{ owner: "Acme", name: "Widgets" }]);
  });

  it("adds many public Projects and lists them all", async () => {
    const platform = platformWithGit(newHome(), succeedingGit());

    const widgets = await platform.addProject("https://github.com/acme/widgets");
    const sprockets = await platform.addProject("https://github.com/other/sprockets");

    assert.equal(widgets.ok, true);
    assert.equal(sprockets.ok, true);
    assert.deepEqual(platform.listProjects(), [
      { owner: "acme", name: "widgets" },
      { owner: "other", name: "sprockets" },
    ]);
  });

  it("shows the same Projects from a second Platform on the same home", async () => {
    const home = newHome();
    const first = platformWithGit(home, succeedingGit());
    const added = await first.addProject("https://github.com/acme/widgets");
    assert.equal(added.ok, true);

    const second = platformWithGit(home, unusedGit("should not clone again"));
    assert.deepEqual(second.listProjects(), [{ owner: "acme", name: "widgets" }]);
  });

  it("accepts owner/name and usual github.com forms as the same identity", async () => {
    const clones: string[] = [];
    const platform = platformWithGit(
      newHome(),
      succeedingGit((request) => clones.push(`${request.owner}/${request.name}`)),
    );

    const fromShorthand = await platform.addProject("acme/widgets");
    assert.deepEqual(fromShorthand, { ok: true, project: { owner: "acme", name: "widgets" } });

    const again = await platform.addProject("git@github.com:acme/widgets.git");
    assert.deepEqual(again, { ok: false, reason: "A Project acme/widgets already exists." });

    const fromTree = await platform.addProject("https://github.com/acme/widgets/tree/main");
    assert.deepEqual(fromTree, { ok: false, reason: "A Project acme/widgets already exists." });
    assert.deepEqual(clones, ["acme/widgets"]);
  });

  it("refuses a non-GitHub URL without cloning", async () => {
    let cloned = false;
    const platform = platformWithGit(newHome(), {
      ...unusedGit(),
      async clonePublic() {
        cloned = true;
        return { ok: true };
      },
      async cloneWithPat() {
        cloned = true;
        return { ok: true };
      },
    });

    const result = await platform.addProject("https://gitlab.com/acme/widgets");

    assert.deepEqual(result, { ok: false, reason: "Not a GitHub URL or owner/name." });
    assert.equal(cloned, false);
    assert.deepEqual(platform.listProjects(), []);
  });

  it("adds a private Project by GitHub URL plus PAT after cloning with that PAT", async () => {
    const clones: GitCloneRequest[] = [];
    const platform = platformWithGit(newHome(), succeedingGit((request) => clones.push(request)));

    const result = await platform.addProject("https://github.com/acme/secret", "github_pat_project");

    assert.deepEqual(result, { ok: true, project: { owner: "acme", name: "secret" } });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "secret" }]);
    assert.equal(clones.length, 1);
    assert.equal(clones[0]?.owner, "acme");
    assert.equal(clones[0]?.name, "secret");
    assert.equal(clones[0]?.credential, "github_pat_project");
  });

  it("clones each private Project with its own PAT and a public Project with none", async () => {
    const clones: GitCloneRequest[] = [];
    const platform = platformWithGit(newHome(), succeedingGit((request) => clones.push(request)));

    const secret = await platform.addProject("https://github.com/acme/secret", "github_pat_secret");
    const other = await platform.addProject("https://github.com/acme/other", "github_pat_other");
    const widgets = await platform.addProject("https://github.com/acme/widgets");

    assert.equal(secret.ok, true);
    assert.equal(other.ok, true);
    assert.equal(widgets.ok, true);
    assert.deepEqual(platform.listProjects(), [
      { owner: "acme", name: "other" },
      { owner: "acme", name: "secret" },
      { owner: "acme", name: "widgets" },
    ]);
    assert.equal(clones[0]?.credential, "github_pat_secret");
    assert.equal(clones[1]?.credential, "github_pat_other");
    assert.equal("credential" in clones[2]!, false);
  });

  it("keeps a failed PAT clone off the list and shows why", async () => {
    const platform = platformWithGit(newHome(), {
      ...unusedGit(),
      async cloneWithPat() {
        return { ok: false, reason: "PAT was rejected or the repository was not found." };
      },
    });

    const result = await platform.addProject("https://github.com/acme/secret", "github_pat_bad");

    assert.deepEqual(result, {
      ok: false,
      reason: "PAT was rejected or the repository was not found.",
    });
    assert.deepEqual(platform.listProjects(), []);
  });

  it("does not leave a clone after a failed PAT add, so a later add of the same identity can succeed", async () => {
    const home = newHome();
    let attempts = 0;
    const platform = platformWithGit(home, {
      ...unusedGit(),
      async cloneWithPat(request) {
        if (existsSync(request.dest)) {
          return { ok: false, reason: "destination exists" };
        }
        attempts += 1;
        mkdirSync(request.dest, { recursive: true });
        if (attempts === 1) {
          return { ok: false, reason: "PAT was rejected or the repository was not found." };
        }
        return { ok: true };
      },
    });

    const failed = await platform.addProject("https://github.com/acme/secret", "github_pat_bad");
    assert.deepEqual(failed, {
      ok: false,
      reason: "PAT was rejected or the repository was not found.",
    });
    assert.deepEqual(platform.listProjects(), []);

    const retry = await platform.addProject("https://github.com/acme/secret", "github_pat_good");
    assert.deepEqual(retry, { ok: true, project: { owner: "acme", name: "secret" } });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "secret" }]);
  });

  it("refuses a non-GitHub URL without cloning even when a PAT is given", async () => {
    let cloned = false;
    const platform = platformWithGit(newHome(), {
      ...unusedGit(),
      async clonePublic() {
        cloned = true;
        return { ok: true };
      },
      async cloneWithPat() {
        cloned = true;
        return { ok: true };
      },
    });

    const result = await platform.addProject("https://gitlab.com/acme/secret", "github_pat_project");

    assert.deepEqual(result, { ok: false, reason: "Not a GitHub URL or owner/name." });
    assert.equal(cloned, false);
    assert.deepEqual(platform.listProjects(), []);
  });

  it("replaces a Project's PAT without removing the Project", async () => {
    const checks: string[] = [];
    const platform = platformWithGit(newHome(), {
      ...succeedingGit(),
      async checkPat(request) {
        checks.push(request.credential);
        return { ok: true };
      },
    });

    const added = await platform.addProject("https://github.com/acme/secret", "github_pat_old");
    assert.equal(added.ok, true);

    const rotated = await platform.replaceProjectPat("acme", "secret", "github_pat_new");

    assert.deepEqual(rotated, { ok: true });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "secret" }]);
    assert.deepEqual(checks, ["github_pat_new"]);
  });

  it("keeps the Project and shows why when replacing the PAT fails", async () => {
    const platform = platformWithGit(newHome(), {
      ...succeedingGit(),
      async checkPat() {
        return { ok: false, reason: "PAT was rejected or the repository was not found." };
      },
    });

    const added = await platform.addProject("https://github.com/acme/secret", "github_pat_old");
    assert.equal(added.ok, true);

    const rotated = await platform.replaceProjectPat("acme", "secret", "github_pat_bad");

    assert.deepEqual(rotated, {
      ok: false,
      reason: "PAT was rejected or the repository was not found.",
    });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "secret" }]);
  });

  it("lets a later good PAT replace succeed after a failed replace", async () => {
    let allow = false;
    const platform = platformWithGit(newHome(), {
      ...succeedingGit(),
      async checkPat() {
        if (!allow) {
          return { ok: false, reason: "PAT was rejected or the repository was not found." };
        }
        return { ok: true };
      },
    });

    const added = await platform.addProject("https://github.com/acme/secret", "github_pat_old");
    assert.equal(added.ok, true);

    const failed = await platform.replaceProjectPat("acme", "secret", "github_pat_bad");
    assert.equal(failed.ok, false);
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "secret" }]);

    allow = true;
    const rotated = await platform.replaceProjectPat("acme", "secret", "github_pat_new");
    assert.deepEqual(rotated, { ok: true });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "secret" }]);
  });

  it("replaces the PAT of a Project persisted on a second Platform", async () => {
    const home = newHome();
    const first = platformWithGit(home, succeedingGit());
    const added = await first.addProject("https://github.com/acme/secret", "github_pat_old");
    assert.equal(added.ok, true);

    const checks: string[] = [];
    const second = platformWithGit(home, {
      ...unusedGit("should not clone again"),
      async checkPat(request) {
        checks.push(request.credential);
        return { ok: true };
      },
    });
    const rotated = await second.replaceProjectPat("Acme", "Secret", "github_pat_new");

    assert.deepEqual(rotated, { ok: true });
    assert.deepEqual(second.listProjects(), [{ owner: "acme", name: "secret" }]);
    assert.deepEqual(checks, ["github_pat_new"]);
  });

  it("refuses to replace a PAT when the Project does not exist", async () => {
    let checked = false;
    const platform = platformWithGit(newHome(), {
      ...unusedGit(),
      async checkPat() {
        checked = true;
        return { ok: true };
      },
    });

    const rotated = await platform.replaceProjectPat("acme", "secret", "github_pat_new");

    assert.deepEqual(rotated, { ok: false, reason: "Project acme/secret does not exist." });
    assert.equal(checked, false);
  });

  it("refuses an empty PAT on replace without checking it", async () => {
    let checked = false;
    const platform = platformWithGit(newHome(), {
      ...succeedingGit(),
      async checkPat() {
        checked = true;
        return { ok: true };
      },
    });
    const added = await platform.addProject("https://github.com/acme/secret", "github_pat_old");
    assert.equal(added.ok, true);

    const rotated = await platform.replaceProjectPat("acme", "secret", "   ");

    assert.deepEqual(rotated, { ok: false, reason: "PAT is required." });
    assert.equal(checked, false);
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "secret" }]);
  });

  it("treats a blank PAT on add as a public clone", async () => {
    const clones: GitCloneRequest[] = [];
    const platform = platformWithGit(newHome(), succeedingGit((request) => clones.push(request)));

    const result = await platform.addProject("https://github.com/acme/widgets", "  ");

    assert.deepEqual(result, { ok: true, project: { owner: "acme", name: "widgets" } });
    assert.equal("credential" in clones[0]!, false);
  });
});
