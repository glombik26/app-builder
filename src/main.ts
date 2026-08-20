import { createGitAdapter } from "./git.ts";
import { createHarnessAdapter } from "./harness.ts";
import { startControlPlane } from "./http.ts";
import { createPlatform, emptyAdapters } from "./platform.ts";

const home = process.env.PLATFORM_HOME ?? "/var/lib/app-builder";
const host = process.env.PLATFORM_HOST ?? "127.0.0.1";
const port = Number(process.env.PLATFORM_PORT ?? "3847");

const platform = createPlatform({
  home,
  adapters: { ...emptyAdapters(), git: createGitAdapter(), harness: createHarnessAdapter() },
});
startControlPlane(platform, { host, port });
