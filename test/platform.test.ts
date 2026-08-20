import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import {
  createPlatform,
  emptyAdapters,
  type GitAdapter,
  type GitCloneRequest,
  type GitWorktreeRequest,
  type HarnessAdapter,
  type Platform,
  type StageId,
} from "../src/platform.ts";
import { renderFeaturePage } from "../src/feature-page.ts";
import { renderHomePage } from "../src/home-page.ts";
import { startControlPlane } from "../src/http.ts";
import { renderProjectPage } from "../src/project-page.ts";

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
  isDirty?: () => boolean,
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
    async worktreeStatus() {
      return { ok: true, dirty: isDirty?.() ?? false };
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
    async worktreeStatus() {
      return { ok: false, reason };
    },
  };
}

async function platformWithProject(home = newHome(), isDirty?: () => boolean) {
  const clones: GitCloneRequest[] = [];
  const worktrees: GitWorktreeRequest[] = [];
  const removed: GitWorktreeRequest[] = [];
  const platform = platformWithGit(
    home,
    succeedingGit(
      (request) => clones.push(request),
      (request) => worktrees.push(request),
      (request) => removed.push(request),
      isDirty,
    ),
  );
  const added = await platform.addProject("https://github.com/acme/widgets");
  assert.equal(added.ok, true);
  return { home, platform, clones, worktrees, removed };
}

const DEVICE_CODE_CEREMONY = {
  verificationUrl: "https://accounts.x.ai/oauth2/device?user_code=ABCD-EFGH",
  userCode: "ABCD-EFGH",
} as const;

function missingSubscriptionHarness(grokHome: string): HarnessAdapter {
  const state = { subscribed: false };
  return {
    async hasSubscription() {
      return state.subscribed || existsSync(join(grokHome, "auth.json"));
    },
    async startDeviceCode() {
      return { ok: true, ceremony: { ...DEVICE_CODE_CEREMONY } };
    },
    async completeDeviceCode() {
      mkdirSync(grokHome, { recursive: true });
      writeFileSync(join(grokHome, "auth.json"), '{"access_token":"test-subscription-token"}\n', {
        mode: 0o600,
      });
      state.subscribed = true;
      return { ok: true };
    },
  };
}

async function platformWithProjectAndHarness(
  home: string,
  harness: HarnessAdapter,
  isDirty?: () => boolean,
) {
  const clones: GitCloneRequest[] = [];
  const worktrees: GitWorktreeRequest[] = [];
  const removed: GitWorktreeRequest[] = [];
  const platform = createPlatform({
    home,
    adapters: {
      ...emptyAdapters(),
      git: succeedingGit(
        (request) => clones.push(request),
        (request) => worktrees.push(request),
        (request) => removed.push(request),
        isDirty,
      ),
      harness,
    },
  });
  const added = await platform.addProject("https://github.com/acme/widgets");
  assert.equal(added.ok, true);
  return { home, platform, clones, worktrees, removed };
}

const STAGE_ORDER: StageId[] = ["grill-with-docs", "to-spec", "to-tickets", "implement"];

async function reachStage(
  platform: Platform,
  featureName: string,
  target: StageId,
): Promise<void> {
  for (const stage of STAGE_ORDER) {
    if (stage === target) {
      return;
    }
    const closed = await platform.closeStage("acme", "widgets", featureName, stage);
    assert.equal(closed.ok, true, closed.ok ? undefined : closed.reason);
    const next = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
    const started = await platform.startStage("acme", "widgets", featureName, next!);
    assert.equal(started.ok, true, started.ok ? undefined : started.reason);
  }
}

function writeHandoff(worktree: string, tickets: string[] = [], spec = "# spec\n"): void {
  mkdirSync(join(worktree, ".scratch", "issues"), { recursive: true });
  writeFileSync(join(worktree, ".scratch", "spec.md"), spec);
  for (const ticket of tickets) {
    writeFileSync(join(worktree, ".scratch", "issues", ticket), `# ${ticket}\n`);
  }
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
      stageStatuses: {
        "grill-with-docs": "open",
        "to-spec": "upcoming",
        "to-tickets": "upcoming",
        implement: "upcoming",
      },
      tickets: [],
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

  it("removes a Project by deleting its record, PAT, clone, worktrees, and Feature records", async () => {
    const home = newHome();
    const clones: GitCloneRequest[] = [];
    const platform = platformWithGit(home, succeedingGit((request) => clones.push(request)));
    const added = await platform.addProject("https://github.com/acme/widgets", "github_pat_widgets");
    assert.equal(added.ok, true);
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await platform.createFeature("acme", "widgets", "billing")).ok, true);
    const widgetsClone = clones[0]!.dest;
    const loginWorktree = join(home, "worktrees", "acme", "widgets", "login-form");
    const billingWorktree = join(home, "worktrees", "acme", "widgets", "billing");
    assert.equal(existsSync(widgetsClone), true);
    assert.equal(existsSync(loginWorktree), true);

    const removed = await platform.removeProject("acme", "widgets");

    assert.deepEqual(removed, { ok: true });
    assert.deepEqual(platform.listProjects(), []);
    assert.deepEqual(platform.listFeatures("acme", "widgets"), []);
    assert.equal(platform.getFeature("acme", "widgets", "login-form"), undefined);
    assert.equal(platform.getFeature("acme", "widgets", "billing"), undefined);
    assert.equal(existsSync(widgetsClone), false);
    assert.equal(existsSync(loginWorktree), false);
    assert.equal(existsSync(billingWorktree), false);

    const reused = await platform.addProject("https://github.com/acme/widgets");
    assert.equal(reused.ok, true);
    assert.equal("credential" in clones[1]!, false);
    const recreated = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(recreated.ok, true);
    assert.equal(platform.getFeature("acme", "widgets", "login-form")?.name, "login-form");
  });

  it("drops Features of a removed Project and leaves other Projects in place", async () => {
    const home = newHome();
    const platform = platformWithGit(home, succeedingGit());
    assert.equal((await platform.addProject("https://github.com/acme/widgets")).ok, true);
    assert.equal((await platform.addProject("https://github.com/other/sprockets")).ok, true);
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await platform.createFeature("other", "sprockets", "login-form")).ok, true);
    const sprocketsClone = join(home, "clones", "other", "sprockets");
    const sprocketsWorktree = join(home, "worktrees", "other", "sprockets", "login-form");

    const removed = await platform.removeProject("acme", "widgets");

    assert.deepEqual(removed, { ok: true });
    assert.deepEqual(platform.listProjects(), [{ owner: "other", name: "sprockets" }]);
    assert.deepEqual(platform.listFeatures("acme", "widgets").map((feature) => feature.name), []);
    assert.equal(platform.getFeature("acme", "widgets", "login-form"), undefined);
    assert.deepEqual(
      platform.listFeatures("other", "sprockets").map((feature) => feature.name),
      ["login-form"],
    );
    assert.equal(platform.getFeature("other", "sprockets", "login-form")?.name, "login-form");
    assert.equal(existsSync(sprocketsClone), true);
    assert.equal(existsSync(sprocketsWorktree), true);
  });

  it("no longer lists a removed Project from a second Platform on the same home", async () => {
    const home = newHome();
    const first = platformWithGit(home, succeedingGit());
    assert.equal((await first.addProject("https://github.com/acme/widgets")).ok, true);
    assert.equal((await first.addProject("https://github.com/other/sprockets")).ok, true);
    assert.equal((await first.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await first.createFeature("other", "sprockets", "login-form")).ok, true);
    assert.equal((await first.removeProject("acme", "widgets")).ok, true);

    const second = platformWithGit(home, unusedGit("should not clone or add a worktree"));
    assert.deepEqual(second.listProjects(), [{ owner: "other", name: "sprockets" }]);
    assert.deepEqual(second.listFeatures("acme", "widgets"), []);
    assert.equal(second.getFeature("acme", "widgets", "login-form"), undefined);
    assert.deepEqual(
      second.listFeatures("other", "sprockets").map((feature) => feature.name),
      ["login-form"],
    );
  });

  it("keeps the Project when remove cannot tear down a Feature worktree", async () => {
    const home = newHome();
    const platform = platformWithGit(home, {
      ...succeedingGit(),
      async removeFeatureWorktree() {
        return { ok: false, reason: "worktree is locked" };
      },
    });
    assert.equal((await platform.addProject("https://github.com/acme/widgets")).ok, true);
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    const clone = join(home, "clones", "acme", "widgets");
    const worktree = join(home, "worktrees", "acme", "widgets", "login-form");

    const removed = await platform.removeProject("acme", "widgets");

    assert.deepEqual(removed, { ok: false, reason: "worktree is locked" });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "widgets" }]);
    assert.equal(platform.getFeature("acme", "widgets", "login-form")?.name, "login-form");
    assert.equal(existsSync(clone), true);
    assert.equal(existsSync(worktree), true);
  });

  it("refuses to remove a Project that does not exist", async () => {
    const platform = createPlatform({ home: newHome(), adapters: emptyAdapters() });
    const removed = await platform.removeProject("acme", "widgets");
    assert.deepEqual(removed, { ok: false, reason: "Project acme/widgets does not exist." });
  });

  it("lets the Operator close grill-with-docs without advancing, even when a spec or Ticket file appears", async () => {
    const { home, platform } = await platformWithProject();
    const created = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(created.ok, true);

    writeHandoff(join(home, "worktrees", "acme", "widgets", "login-form"), ["login.md"]);

    const closed = await platform.closeStage("acme", "widgets", "login-form", "grill-with-docs");
    assert.equal(closed.ok, true);
    if (!closed.ok) {
      return;
    }

    assert.equal(closed.feature.openStage, "grill-with-docs");
    assert.deepEqual(closed.feature.stageStatuses, {
      "grill-with-docs": "closed",
      "to-spec": "upcoming",
      "to-tickets": "upcoming",
      implement: "upcoming",
    });
    assert.deepEqual(platform.getFeature("acme", "widgets", "login-form")?.stageStatuses, {
      "grill-with-docs": "closed",
      "to-spec": "upcoming",
      "to-tickets": "upcoming",
      implement: "upcoming",
    });
  });

  it("lets the Operator reopen a closed Stage until the next Stage has started", async () => {
    const { platform } = await platformWithProject();
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await platform.closeStage("acme", "widgets", "login-form", "grill-with-docs")).ok, true);

    const reopened = await platform.reopenStage("acme", "widgets", "login-form", "grill-with-docs");
    assert.equal(reopened.ok, true);
    if (!reopened.ok) {
      return;
    }
    assert.equal(reopened.feature.openStage, "grill-with-docs");
    assert.equal(reopened.feature.stageStatuses["grill-with-docs"], "open");
    assert.equal(reopened.feature.stageStatuses["to-spec"], "upcoming");
  });

  it("locks a closed Stage once the next Stage has started; abort is the only way back", async () => {
    const { home, platform } = await platformWithProject();
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await platform.closeStage("acme", "widgets", "login-form", "grill-with-docs")).ok, true);

    const started = await platform.startStage("acme", "widgets", "login-form", "to-spec");
    assert.equal(started.ok, true);
    if (!started.ok) {
      return;
    }
    assert.equal(started.feature.openStage, "to-spec");
    assert.equal(started.feature.stageStatuses["grill-with-docs"], "locked");
    assert.equal(started.feature.stageStatuses["to-spec"], "open");

    const reopen = await platform.reopenStage("acme", "widgets", "login-form", "grill-with-docs");
    assert.deepEqual(reopen, {
      ok: false,
      reason: "Stage grill-with-docs is locked because the next Stage has started.",
    });
    assert.equal(platform.getFeature("acme", "widgets", "login-form")?.stageStatuses["grill-with-docs"], "locked");

    const aborted = await platform.abortFeature("acme", "widgets", "login-form");
    assert.deepEqual(aborted, { ok: true });
    assert.equal(platform.getFeature("acme", "widgets", "login-form"), undefined);
    const reused = await platform.createFeature("acme", "widgets", "login-form");
    assert.equal(reused.ok, true);
    assert.equal(reused.ok && reused.feature.openStage, "grill-with-docs");
    assert.equal(existsSync(join(home, "worktrees", "acme", "widgets", "login-form")), true);
  });

  it("refuses to start the next Stage before the current one is closed", async () => {
    const { platform } = await platformWithProject();
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);

    const started = await platform.startStage("acme", "widgets", "login-form", "to-spec");
    assert.deepEqual(started, {
      ok: false,
      reason: "Stage to-spec cannot start until grill-with-docs is closed.",
    });
    assert.equal(platform.getFeature("acme", "widgets", "login-form")?.openStage, "grill-with-docs");
  });

  it("keeps closed, reopened, and locked Stages on a second Platform on the same home", async () => {
    const home = newHome();
    const first = platformWithGit(home, succeedingGit());
    assert.equal((await first.addProject("https://github.com/acme/widgets")).ok, true);
    assert.equal((await first.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await first.closeStage("acme", "widgets", "login-form", "grill-with-docs")).ok, true);
    assert.equal((await first.startStage("acme", "widgets", "login-form", "to-spec")).ok, true);

    const second = platformWithGit(home, unusedGit("should not clone or add a worktree"));
    const feature = second.getFeature("acme", "widgets", "login-form");
    assert.equal(feature?.openStage, "to-spec");
    assert.equal(feature?.stageStatuses["grill-with-docs"], "locked");
    assert.equal(feature?.stageStatuses["to-spec"], "open");
  });

  it("shows implement as a Ticket shell from the worktree handoff, including empty", async () => {
    const { home, platform } = await platformWithProject();
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    await reachStage(platform, "login-form", "implement");

    const empty = platform.getFeature("acme", "widgets", "login-form");
    assert.equal(empty?.openStage, "implement");
    assert.deepEqual(empty?.tickets, []);

    writeHandoff(join(home, "worktrees", "acme", "widgets", "login-form"), ["billing.md", "login.md"]);
    const listed = platform.getFeature("acme", "widgets", "login-form");
    assert.deepEqual(listed?.tickets, [
      { name: "billing.md", closedInImplement: false },
      { name: "login.md", closedInImplement: false },
    ]);
  });

  it("refuses implement close when the worktree is dirty", async () => {
    let dirty = true;
    const { platform } = await platformWithProject(newHome(), () => dirty);
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    await reachStage(platform, "login-form", "implement");

    const refused = await platform.closeStage("acme", "widgets", "login-form", "implement");
    assert.deepEqual(refused, {
      ok: false,
      reason: "implement close is refused because the worktree is dirty.",
    });
    assert.equal(platform.getFeature("acme", "widgets", "login-form")?.stageStatuses.implement, "open");

    dirty = false;
    const closed = await platform.closeStage("acme", "widgets", "login-form", "implement");
    assert.equal(closed.ok, true);
    assert.equal(closed.ok && closed.feature.stageStatuses.implement, "closed");
  });

  it("refuses implement close while a Ticket is not closed-in-implement, and allows it when every Ticket is closed and the tree is clean", async () => {
    const { home, platform } = await platformWithProject();
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    writeHandoff(join(home, "worktrees", "acme", "widgets", "login-form"), ["login.md", "billing.md"]);
    await reachStage(platform, "login-form", "implement");

    const openTickets = await platform.closeStage("acme", "widgets", "login-form", "implement");
    assert.deepEqual(openTickets, {
      ok: false,
      reason: "implement close is refused because a Ticket is not closed-in-implement.",
    });

    const login = await platform.closeTicket("acme", "widgets", "login-form", "login.md");
    assert.equal(login.ok, true);
    const stillOpen = await platform.closeStage("acme", "widgets", "login-form", "implement");
    assert.deepEqual(stillOpen, {
      ok: false,
      reason: "implement close is refused because a Ticket is not closed-in-implement.",
    });

    const billing = await platform.closeTicket("acme", "widgets", "login-form", "billing.md");
    assert.equal(billing.ok, true);
    if (!billing.ok) {
      return;
    }
    assert.deepEqual(billing.feature.tickets, [
      { name: "billing.md", closedInImplement: true },
      { name: "login.md", closedInImplement: true },
    ]);

    const closed = await platform.closeStage("acme", "widgets", "login-form", "implement");
    assert.equal(closed.ok, true);
    assert.equal(closed.ok && closed.feature.stageStatuses.implement, "closed");
  });

  it("allows implement close when the Ticket list is empty and the worktree is clean", async () => {
    const { platform } = await platformWithProject();
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    await reachStage(platform, "login-form", "implement");

    const closed = await platform.closeStage("acme", "widgets", "login-form", "implement");
    assert.equal(closed.ok, true);
    assert.equal(closed.ok && closed.feature.stageStatuses.implement, "closed");
    assert.deepEqual(closed.ok ? closed.feature.tickets : undefined, []);
  });

  it("keeps closed-in-implement as a Platform fact on a second Platform on the same home", async () => {
    const home = newHome();
    const first = platformWithGit(home, succeedingGit());
    assert.equal((await first.addProject("https://github.com/acme/widgets")).ok, true);
    assert.equal((await first.createFeature("acme", "widgets", "login-form")).ok, true);
    writeHandoff(join(home, "worktrees", "acme", "widgets", "login-form"), ["login.md"]);
    await reachStage(first, "login-form", "implement");
    assert.equal((await first.closeTicket("acme", "widgets", "login-form", "login.md")).ok, true);

    const second = platformWithGit(home, unusedGit("should not clone or add a worktree"));
    assert.deepEqual(second.getFeature("acme", "widgets", "login-form")?.tickets, [
      { name: "login.md", closedInImplement: true },
    ]);
  });

  it("renders a stage-led Feature screen with no iframe, git-diff panel, environment dashboard, or API console", async () => {
    const { home, platform } = await platformWithProject();
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    writeHandoff(join(home, "worktrees", "acme", "widgets", "login-form"), ["login.md"]);
    await reachStage(platform, "login-form", "implement");
    const feature = platform.getFeature("acme", "widgets", "login-form");
    assert.ok(feature);

    const html = renderFeaturePage({ feature });
    assert.match(html, /<ol class="stages">/);
    assert.match(html, /grill-with-docs/);
    assert.match(html, /to-spec/);
    assert.match(html, /to-tickets/);
    assert.match(html, /implement/);
    assert.match(html, /login\.md/);
    assert.match(html, />Close</);
    assert.match(html, /Close ticket/);
    assert.equal(html.includes("<iframe"), false);
    assert.equal(/git[\s-]*diff/i.test(html), false);
    assert.equal(/environment dashboard/i.test(html), false);
    assert.equal(/api console/i.test(html), false);
  });

  it("renders Reopen and Start next after the Operator closes a Stage", async () => {
    const { platform } = await platformWithProject();
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await platform.closeStage("acme", "widgets", "login-form", "grill-with-docs")).ok, true);
    const html = renderFeaturePage({ feature: platform.getFeature("acme", "widgets", "login-form")! });
    assert.match(html, />Reopen</);
    assert.match(html, /Start to-spec/);
  });

  it("renders Remove on Home and on the Project screen", async () => {
    const { platform } = await platformWithProject();
    const project = { owner: "acme", name: "widgets" };

    const home = renderHomePage({ projects: platform.listProjects() });
    assert.match(home, /action="\/projects\/acme\/widgets\/remove"/);
    assert.match(home, />Remove</);

    const page = renderProjectPage({
      project,
      features: platform.listFeatures("acme", "widgets"),
    });
    assert.match(page, /action="\/projects\/acme\/widgets\/remove"/);
    assert.match(page, />Remove</);
  });

  it("presents a new Device-code ceremony after a failed start", async () => {
    let attempts = 0;
    const harness: HarnessAdapter = {
      async hasSubscription() {
        return false;
      },
      async startDeviceCode() {
        attempts += 1;
        if (attempts === 1) {
          return { ok: false, reason: "grok login exited" };
        }
        return { ok: true, ceremony: { ...DEVICE_CODE_CEREMONY } };
      },
      async completeDeviceCode() {
        return { ok: false, reason: "Device-code authorization is still pending." };
      },
    };
    const { platform } = await platformWithProjectAndHarness(newHome(), harness);

    const first = await platform.subscription();
    assert.deepEqual(first, { present: false, reason: "grok login exited" });
    const second = await platform.subscription();
    assert.deepEqual(second, { present: false, ceremony: { ...DEVICE_CODE_CEREMONY } });
  });

  it("presents a Device-code ceremony when the subscription is missing", async () => {
    const grokHome = newHome();
    const { platform } = await platformWithProjectAndHarness(newHome(), missingSubscriptionHarness(grokHome));

    const subscription = await platform.subscription();

    assert.deepEqual(subscription, {
      present: false,
      ceremony: {
        verificationUrl: "https://accounts.x.ai/oauth2/device?user_code=ABCD-EFGH",
        userCode: "ABCD-EFGH",
      },
    });
  });

  it("does not treat XAI_API_KEY as the Operator subscription", async () => {
    const grokHome = newHome();
    const previous = process.env.XAI_API_KEY;
    process.env.XAI_API_KEY = "xai-not-a-subscription";
    try {
      const { platform } = await platformWithProjectAndHarness(
        newHome(),
        missingSubscriptionHarness(grokHome),
      );
      const subscription = await platform.subscription();
      assert.equal(subscription.present, false);
    } finally {
      if (previous === undefined) {
        delete process.env.XAI_API_KEY;
      } else {
        process.env.XAI_API_KEY = previous;
      }
    }
  });

  it("does not start Device-code when listing Projects", async () => {
    let started = 0;
    const grokHome = newHome();
    const harness = missingSubscriptionHarness(grokHome);
    const counting: HarnessAdapter = {
      ...harness,
      async startDeviceCode() {
        started += 1;
        return harness.startDeviceCode();
      },
    };
    const { platform } = await platformWithProjectAndHarness(newHome(), counting);
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "widgets" }]);
    assert.equal(started, 0);
    await platform.subscription();
    assert.equal(started, 1);
  });

  it("lets the Operator list and add Projects while the Device-code ceremony is pending", async () => {
    const grokHome = newHome();
    const home = newHome();
    const { platform } = await platformWithProjectAndHarness(home, missingSubscriptionHarness(grokHome));

    const subscription = await platform.subscription();
    assert.equal(subscription.present, false);
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "widgets" }]);

    const sprockets = await platform.addProject("https://github.com/other/sprockets");
    assert.equal(sprockets.ok, true);
    assert.deepEqual(platform.listProjects(), [
      { owner: "acme", name: "widgets" },
      { owner: "other", name: "sprockets" },
    ]);
  });

  it("blocks sending a Turn until the Device-code ceremony is completed", async () => {
    const grokHome = newHome();
    const { platform } = await platformWithProjectAndHarness(newHome(), missingSubscriptionHarness(grokHome));
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);

    const blocked = await platform.sendTurn(
      "acme",
      "widgets",
      "login-form",
      "/grill-with-docs login-form",
    );
    assert.deepEqual(blocked, {
      ok: false,
      reason: "Device-code ceremony is required before sending a Turn.",
    });
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "widgets" }]);
    assert.equal(platform.getFeature("acme", "widgets", "login-form")?.name, "login-form");

    const completed = await platform.completeDeviceCode();
    assert.deepEqual(completed, { ok: true });

    const sent = await platform.sendTurn(
      "acme",
      "widgets",
      "login-form",
      "/grill-with-docs login-form",
    );
    assert.deepEqual(sent, { ok: true });
    assert.deepEqual(await platform.subscription(), { present: true });
  });

  it("keeps the subscription token in the grok-build auth file, not as a Platform secret", async () => {
    const grokHome = newHome();
    const home = newHome();
    const { platform } = await platformWithProjectAndHarness(home, missingSubscriptionHarness(grokHome));
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    assert.equal((await platform.completeDeviceCode()).ok, true);

    const grokAuth = readFileSync(join(grokHome, "auth.json"), "utf8");
    assert.match(grokAuth, /test-subscription-token/);
    assert.equal(treeContains(home, "test-subscription-token"), false);
    assert.equal(existsSync(join(home, "auth.json")), false);
  });

  it("renders the Device-code ceremony on the Feature, not on the Project list", async () => {
    const grokHome = newHome();
    const { platform } = await platformWithProjectAndHarness(newHome(), missingSubscriptionHarness(grokHome));
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    const subscription = await platform.subscription();
    assert.equal(subscription.present, false);
    if (subscription.present || !("ceremony" in subscription)) {
      return;
    }

    const home = renderHomePage({ projects: platform.listProjects() });
    assert.match(home, /acme\/widgets/);
    assert.equal(home.includes("Device-code"), false);
    assert.equal(home.includes("ABCD-EFGH"), false);
    assert.equal(home.includes("accounts.x.ai"), false);

    const html = renderFeaturePage({
      feature: platform.getFeature("acme", "widgets", "login-form")!,
      ceremony: subscription.ceremony,
    });
    assert.match(html, /Device-code/);
    assert.match(html, /ABCD-EFGH/);
    assert.match(
      html,
      /https:\/\/accounts\.x\.ai\/oauth2\/device\?user_code=ABCD-EFGH/,
    );
    assert.match(html, /Complete Device-code/);
    assert.equal(html.includes('name="username"'), false);
    assert.equal(html.includes('name="password"'), false);
    assert.match(html, />Abort</);
  });

  it("keeps Control-Plane Basic Auth a separate act from Device-code", async () => {
    const grokHome = newHome();
    const { platform } = await platformWithProjectAndHarness(newHome(), missingSubscriptionHarness(grokHome));
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);
    const subscription = await platform.subscription();
    assert.equal(subscription.present, false);
    if (subscription.present || !("ceremony" in subscription)) {
      return;
    }

    const html = renderFeaturePage({
      feature: platform.getFeature("acme", "widgets", "login-form")!,
      ceremony: subscription.ceremony,
    });
    assert.match(html, /Device-code/);
    assert.equal(/www-authenticate/i.test(html), false);
    assert.equal(/http basic/i.test(html), false);
    assert.equal(html.includes('autocomplete="username"'), false);

    assert.equal((await platform.completeDeviceCode()).ok, true);
    const after = renderFeaturePage({
      feature: platform.getFeature("acme", "widgets", "login-form")!,
    });
    assert.equal(after.includes("Device-code"), false);
    assert.deepEqual(platform.listProjects(), [{ owner: "acme", name: "widgets" }]);
  });

  it("shows Device-code on the Feature screen and leaves Home as the Project list", async () => {
    const grokHome = newHome();
    const { platform } = await platformWithProjectAndHarness(
      newHome(),
      missingSubscriptionHarness(grokHome),
    );
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);

    await withControlPlane(platform, async (base) => {
      const home = await fetch(`${base}/`);
      assert.equal(home.status, 200);
      const homeHtml = await home.text();
      assert.match(homeHtml, /acme\/widgets/);
      assert.equal(homeHtml.includes("Device-code"), false);
      assert.equal(homeHtml.includes("ABCD-EFGH"), false);

      const feature = await fetch(`${base}/projects/acme/widgets/features/login-form`);
      assert.equal(feature.status, 200);
      const featureHtml = await feature.text();
      assert.match(featureHtml, /Device-code/);
      assert.match(featureHtml, /ABCD-EFGH/);
      assert.match(featureHtml, /Complete Device-code/);
    });
  });

  it("completes Device-code on the Feature and then allows sending a Turn", async () => {
    const grokHome = newHome();
    const { platform } = await platformWithProjectAndHarness(
      newHome(),
      missingSubscriptionHarness(grokHome),
    );
    assert.equal((await platform.createFeature("acme", "widgets", "login-form")).ok, true);

    await withControlPlane(platform, async (base) => {
      const submitted = await fetch(`${base}/device-code`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "return=/projects/acme/widgets/features/login-form",
        redirect: "manual",
      });
      assert.equal(submitted.status, 303);
      assert.equal(
        submitted.headers.get("location"),
        "/projects/acme/widgets/features/login-form",
      );

      const feature = await fetch(`${base}/projects/acme/widgets/features/login-form`);
      const html = await feature.text();
      assert.equal(html.includes("Device-code"), false);
    });

    const sent = await platform.sendTurn(
      "acme",
      "widgets",
      "login-form",
      "/grill-with-docs login-form",
    );
    assert.deepEqual(sent, { ok: true });
  });
});

async function withControlPlane(platform: Platform, run: (base: string) => Promise<void>): Promise<void> {
  const server = startControlPlane(platform, { host: "127.0.0.1", port: 0 });
  if (!server.listening) {
    await once(server, "listening");
  }
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function treeContains(dir: string, needle: string): boolean {
  if (!existsSync(dir)) {
    return false;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (treeContains(path, needle)) {
        return true;
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    try {
      if (readFileSync(path, "utf8").includes(needle)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}
