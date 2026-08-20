import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  createPlatform,
  emptyAdapters,
  type GitAdapter,
  type GitCloneRequest,
  type GitWorktreeRequest,
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

function succeedingGit(
  onClone?: (request: GitCloneRequest) => void,
  onAddWorktree?: (request: GitWorktreeRequest) => void,
  onRemoveWorktree?: (request: GitWorktreeRequest) => void,
): GitAdapter {
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
    async addFeatureWorktree(request) {
      onAddWorktree?.(request);
      return writeWorktree(request);
    },
    async removeFeatureWorktree(request) {
      onRemoveWorktree?.(request);
      rmSync(request.worktree, { recursive: true, force: true });
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

function writeWorktree(request: GitWorktreeRequest): { ok: true } | { ok: false; reason: string } {
  if (!existsSync(request.clone)) {
    return { ok: false, reason: "clone does not exist" };
  }
  mkdirSync(request.worktree, { recursive: true });
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
    async addFeatureWorktree() {
      return { ok: false, reason };
    },
    async removeFeatureWorktree() {
      return { ok: false, reason };
    },
  };
}

async function platformWithProject(home = newHome()) {
  const clones: GitCloneRequest[] = [];
  const worktrees: GitWorktreeRequest[] = [];
  const removed: GitWorktreeRequest[] = [];
  const platform = platformWithGit(
    home,
    succeedingGit(
      (request) => clones.push(request),
      (request) => worktrees.push(request),
      (request) => removed.push(request),
    ),
  );
  const added = await platform.addProject("https://github.com/acme/widgets");
  assert.equal(added.ok, true);
  return { home, platform, clones, worktrees, removed };
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

  it("creates a Feature as one local branch from the Project default and one worktree of the single clone, without pushing", async () => {
    const { home, platform, clones, worktrees } = await platformWithProject();

    const created = await platform.createFeature("acme", "widgets", "login-form");

    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    assert.equal(created.feature.name, "login-form");
    assert.equal(clones.length, 1);
    assert.equal(worktrees.length, 1);
    assert.equal(worktrees[0]?.clone, clones[0]?.dest);
    assert.equal(worktrees[0]?.clone, join(home, "clones", "acme", "widgets"));
    assert.equal(worktrees[0]?.branch, "feature/login-form");
    assert.equal(worktrees[0]?.startPoint, "HEAD");
    assert.equal(worktrees[0]?.worktree, join(home, "worktrees", "acme", "widgets", "login-form"));
    assert.equal(existsSync(clones[0]!.dest), true);
    assert.equal(existsSync(worktrees[0]!.worktree), true);
    assert.deepEqual(platform.listFeatures("acme", "widgets").map((feature) => feature.name), [
      "login-form",
    ]);
  });

  it("keeps the Feature name unique within the Project and unchanged after create", async () => {
    const { platform } = await platformWithProject();
    const created = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(created.ok, true);

    const duplicate = await platform.createFeature("acme", "widgets", "login-form");
    assert.deepEqual(duplicate, {
      ok: false,
      reason: "A Feature login-form already exists.",
    });

    const listed = platform.listFeatures("acme", "widgets");
    assert.deepEqual(
      listed.map((feature) => feature.name),
      ["login-form"],
    );
    assert.equal(platform.getFeature("acme", "widgets", "login-form")?.name, "login-form");
  });

  it("refuses empty or illegal Feature names without touching the clone", async () => {
    const { home, platform, clones, worktrees } = await platformWithProject();
    const clone = join(home, "clones", "acme", "widgets");

    for (const name of ["", "   ", "login form", "foo/bar", ".", "..", "-lead", "trail.", "foo..bar"]) {
      const result = await platform.createFeature("acme", "widgets", name);
      assert.deepEqual(result, { ok: false, reason: "Feature name is empty or illegal." });
    }

    assert.deepEqual(platform.listFeatures("acme", "widgets"), []);
    assert.equal(worktrees.length, 0);
    assert.equal(clones.length, 1);
    assert.equal(existsSync(clone), true);
  });

  it("refuses a Feature whose slug collides with another Feature of that Project", async () => {
    const { platform, worktrees } = await platformWithProject();
    const first = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(first.ok, true);

    const collision = await platform.createFeature("acme", "widgets", "login_form");
    assert.deepEqual(collision, {
      ok: false,
      reason:
        "A Feature login_form would slug to the same hostname or Compose-project label as login-form.",
    });
    assert.deepEqual(
      platform.listFeatures("acme", "widgets").map((feature) => feature.name),
      ["login-form"],
    );
    assert.equal(worktrees.length, 1);
  });

  it("refuses a Feature whose slug collides with an Environment of that Project", async () => {
    const { platform, worktrees } = await platformWithProject();

    const testName = await platform.createFeature("acme", "widgets", "test");
    assert.deepEqual(testName, {
      ok: false,
      reason:
        "A Feature test would slug to the same hostname or Compose-project label as the TEST Environment of this Project.",
    });

    const prodName = await platform.createFeature("acme", "widgets", "Prod");
    assert.deepEqual(prodName, {
      ok: false,
      reason:
        "A Feature Prod would slug to the same hostname or Compose-project label as the PROD Environment of this Project.",
    });

    assert.deepEqual(platform.listFeatures("acme", "widgets"), []);
    assert.equal(worktrees.length, 0);
  });

  it("allows several Features open on one Project at once", async () => {
    const { platform } = await platformWithProject();

    const login = await platform.createFeature("acme", "widgets", "login-form");
    const billing = await platform.createFeature("acme", "widgets", "billing");

    assert.equal(login.ok, true);
    assert.equal(billing.ok, true);
    assert.deepEqual(
      platform.listFeatures("acme", "widgets").map((feature) => feature.name),
      ["billing", "login-form"],
    );
  });

  it("allows the same Feature name on two Projects", async () => {
    const home = newHome();
    const platform = platformWithGit(home, succeedingGit());
    assert.equal((await platform.addProject("https://github.com/acme/widgets")).ok, true);
    assert.equal((await platform.addProject("https://github.com/other/sprockets")).ok, true);

    const first = await platform.createFeature("acme", "widgets", "login-form");
    const second = await platform.createFeature("other", "sprockets", "login-form");

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.deepEqual(
      platform.listFeatures("acme", "widgets").map((feature) => feature.name),
      ["login-form"],
    );
    assert.deepEqual(
      platform.listFeatures("other", "sprockets").map((feature) => feature.name),
      ["login-form"],
    );
  });

  it("shows Feature chrome, Preview status and links, abort, and the four-Stage rail with grill-with-docs open", async () => {
    const { platform } = await platformWithProject();
    const created = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }

    assert.deepEqual(created.feature, {
      name: "login-form",
      project: { owner: "acme", name: "widgets" },
      stages: ["grill-with-docs", "to-spec", "to-tickets", "implement"],
      openStage: "grill-with-docs",
      preview: { status: "none", links: [] },
    });
    assert.deepEqual(platform.getFeature("acme", "widgets", "login-form"), created.feature);
  });

  it("creates a Feature even when the worktree has no Compose contract", async () => {
    const { platform, worktrees } = await platformWithProject();
    const created = await platform.createFeature("acme", "widgets", "docs-only");

    assert.equal(created.ok, true);
    assert.equal(existsSync(join(worktrees[0]!.worktree, "compose.yaml")), false);
    assert.equal(existsSync(join(worktrees[0]!.worktree, "docker-compose.yml")), false);
    assert.equal(platform.getFeature("acme", "widgets", "docs-only")?.openStage, "grill-with-docs");
  });

  it("refuses to create a Feature when the Project does not exist", async () => {
    const platform = createPlatform({ home: newHome(), adapters: emptyAdapters() });
    const created = await platform.createFeature("acme", "widgets", "login-form");
    assert.deepEqual(created, { ok: false, reason: "Project acme/widgets does not exist." });
  });

  it("does not leave a worktree after a failed Feature create, so a later create of the same name can succeed", async () => {
    const home = newHome();
    let attempts = 0;
    const platform = platformWithGit(home, {
      ...succeedingGit(),
      async addFeatureWorktree(request) {
        if (existsSync(request.worktree)) {
          return { ok: false, reason: "destination exists" };
        }
        attempts += 1;
        mkdirSync(request.worktree, { recursive: true });
        if (attempts === 1) {
          return { ok: false, reason: "disk full" };
        }
        return { ok: true };
      },
    });
    assert.equal((await platform.addProject("https://github.com/acme/widgets")).ok, true);

    const failed = await platform.createFeature("acme", "widgets", "login-form");
    assert.deepEqual(failed, { ok: false, reason: "disk full" });
    assert.deepEqual(platform.listFeatures("acme", "widgets"), []);
    assert.equal(existsSync(join(home, "worktrees", "acme", "widgets", "login-form")), false);

    const retry = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(retry.ok, true);
    assert.deepEqual(
      platform.listFeatures("acme", "widgets").map((feature) => feature.name),
      ["login-form"],
    );
  });

  it("aborts a Feature by deleting its worktree, local branch, and record so the name is free", async () => {
    const { home, platform, clones, removed } = await platformWithProject();
    const created = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(created.ok, true);
    const other = await platform.createFeature("acme", "widgets", "billing");
    assert.equal(other.ok, true);
    const loginWorktree = join(home, "worktrees", "acme", "widgets", "login-form");
    const billingWorktree = join(home, "worktrees", "acme", "widgets", "billing");
    assert.equal(existsSync(loginWorktree), true);

    const aborted = await platform.abortFeature("acme", "widgets", "login-form");

    assert.deepEqual(aborted, { ok: true });
    assert.equal(platform.getFeature("acme", "widgets", "login-form"), undefined);
    assert.deepEqual(
      platform.listFeatures("acme", "widgets").map((feature) => feature.name),
      ["billing"],
    );
    assert.equal(existsSync(loginWorktree), false);
    assert.equal(existsSync(billingWorktree), true);
    assert.equal(existsSync(clones[0]!.dest), true);
    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.branch, "feature/login-form");
    assert.equal(removed[0]?.worktree, loginWorktree);
    assert.equal(removed[0]?.clone, clones[0]?.dest);

    const reused = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(reused.ok, true);
    assert.equal(existsSync(loginWorktree), true);
  });

  it("keeps the Feature when abort cannot remove the worktree", async () => {
    const home = newHome();
    const platform = platformWithGit(home, {
      ...succeedingGit(),
      async removeFeatureWorktree() {
        return { ok: false, reason: "worktree is locked" };
      },
    });
    assert.equal((await platform.addProject("https://github.com/acme/widgets")).ok, true);
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);

    const aborted = await platform.abortFeature("acme", "widgets", "login-form");

    assert.deepEqual(aborted, { ok: false, reason: "worktree is locked" });
    assert.equal(platform.getFeature("acme", "widgets", "login-form")?.name, "login-form");
    assert.equal(existsSync(join(home, "worktrees", "acme", "widgets", "login-form")), true);
  });

  it("shows remaining Features and no aborted record on a second Platform on the same home", async () => {
    const home = newHome();
    const first = platformWithGit(home, succeedingGit());
    assert.equal((await first.addProject("https://github.com/acme/widgets")).ok, true);
    assert.equal((await first.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await first.createFeature("acme", "widgets", "billing")).ok, true);
    assert.equal((await first.abortFeature("acme", "widgets", "login-form")).ok, true);

    const second = platformWithGit(home, unusedGit("should not clone or add a worktree"));
    assert.deepEqual(
      second.listFeatures("acme", "widgets").map((feature) => feature.name),
      ["billing"],
    );
    assert.equal(second.getFeature("acme", "widgets", "login-form"), undefined);
    assert.equal(second.getFeature("acme", "widgets", "billing")?.name, "billing");
    assert.deepEqual(second.listProjects(), [{ owner: "acme", name: "widgets" }]);
  });

  it("refuses to abort a Feature that does not exist", async () => {
    const { platform } = await platformWithProject();
    const aborted = await platform.abortFeature("acme", "widgets", "login-form");
    assert.deepEqual(aborted, { ok: false, reason: "Feature login-form does not exist." });
  });
});
