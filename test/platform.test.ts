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
      if (!existsSync(dirname(request.dest))) {
        return { ok: false, reason: "parent does not exist" };
      }
      mkdirSync(request.dest, { recursive: true });
      return { ok: true };
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

    const second = platformWithGit(home, {
      async clonePublic() {
        return { ok: false, reason: "should not clone again" };
      },
    });
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
      async clonePublic() {
        cloned = true;
        return { ok: true };
      },
    });

    const result = await platform.addProject("https://gitlab.com/acme/widgets");

    assert.deepEqual(result, { ok: false, reason: "Not a GitHub URL or owner/name." });
    assert.equal(cloned, false);
    assert.deepEqual(platform.listProjects(), []);
  });
});
