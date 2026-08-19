import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createPlatform, emptyAdapters } from "../src/platform.ts";

function newHome(): string {
  return mkdtempSync(join(tmpdir(), "platform-home-"));
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
});
