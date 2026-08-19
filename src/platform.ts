import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type GitCloneRequest = {
  owner: string;
  name: string;
  dest: string;
};

export type GitCloneResult = { ok: true } | { ok: false; reason: string };

export type GitAdapter = {
  clonePublic(request: GitCloneRequest): Promise<GitCloneResult>;
};

export type ComposeAdapter = object;
export type HarnessAdapter = object;
export type Clock = object;
export type HostMemory = object;

export type Adapters = {
  git: GitAdapter;
  compose: ComposeAdapter;
  harness: HarnessAdapter;
  clock: Clock;
  hostMemory: HostMemory;
};

export type Project = {
  owner: string;
  name: string;
};

export type AddProjectResult =
  | { ok: true; project: Project }
  | { ok: false; reason: string };

export type Platform = {
  listProjects(): Project[];
  addProject(input: string): Promise<AddProjectResult>;
};

const STATE_PROJECTS_DIR = join("state", "projects");
const CLONES_DIR = "clones";

export function emptyAdapters(): Adapters {
  return {
    git: {
      async clonePublic() {
        return { ok: false, reason: "Git adapter is not configured" };
      },
    },
    compose: {},
    harness: {},
    clock: {},
    hostMemory: {},
  };
}

export function createPlatform(options: {
  home: string;
  adapters: Adapters;
}): Platform {
  const recordsDir = join(options.home, STATE_PROJECTS_DIR);
  mkdirSync(recordsDir, { recursive: true });

  return {
    listProjects() {
      return loadProjects(recordsDir);
    },
    async addProject(input) {
      const parsed = parseGitHubIdentity(input);
      if (!parsed.ok) {
        return parsed;
      }
      const { owner, name } = parsed.project;
      const existing = findProject(loadProjects(recordsDir), owner, name);
      if (existing) {
        return { ok: false, reason: `A Project ${existing.owner}/${existing.name} already exists.` };
      }
      const dest = join(options.home, CLONES_DIR, owner, name);
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dirname(dest), { recursive: true });
      const clone = await options.adapters.git.clonePublic({ owner, name, dest });
      if (!clone.ok) {
        rmSync(dest, { recursive: true, force: true });
        return clone;
      }
      const ownerDir = join(recordsDir, owner);
      mkdirSync(ownerDir, { recursive: true });
      writeFileSync(join(ownerDir, `${name}.json`), `${JSON.stringify({ owner, name })}\n`);
      return { ok: true, project: { owner, name } };
    },
  };
}

function parseGitHubIdentity(input: string): AddProjectResult {
  const trimmed = input.trim();
  const forms = [
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/i,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^(?:github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?$/i,
  ];
  for (const form of forms) {
    const match = trimmed.match(form);
    if (!match) {
      continue;
    }
    const owner = match[1]!;
    const name = match[2]!;
    if (isGitHubOwner(owner) && isGitHubName(name)) {
      return { ok: true, project: { owner, name } };
    }
  }
  return { ok: false, reason: "Not a GitHub URL or owner/name." };
}

function isGitHubOwner(owner: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner);
}

function isGitHubName(name: string): boolean {
  return name !== "." && name !== ".." && /^[A-Za-z0-9._-]+$/.test(name);
}

function findProject(projects: Project[], owner: string, name: string): Project | undefined {
  const ownerKey = owner.toLowerCase();
  const nameKey = name.toLowerCase();
  return projects.find(
    (project) => project.owner.toLowerCase() === ownerKey && project.name.toLowerCase() === nameKey,
  );
}

function loadProjects(recordsDir: string): Project[] {
  const projects: Project[] = [];
  for (const ownerEntry of readdirSync(recordsDir, { withFileTypes: true })) {
    if (!ownerEntry.isDirectory() || ownerEntry.name.startsWith(".")) {
      continue;
    }
    const ownerDir = join(recordsDir, ownerEntry.name);
    for (const nameEntry of readdirSync(ownerDir, { withFileTypes: true })) {
      if (!nameEntry.isFile() || !nameEntry.name.endsWith(".json")) {
        continue;
      }
      const recorded = JSON.parse(readFileSync(join(ownerDir, nameEntry.name), "utf8")) as Project;
      projects.push({ owner: recorded.owner, name: recorded.name });
    }
  }
  return projects.sort(
    (a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name),
  );
}
