import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type GitAdapter = object;
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

export type Platform = {
  listProjects(): Project[];
};

const PROJECTS_DIR = "projects";

export function emptyAdapters(): Adapters {
  return {
    git: {},
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
  const projectsDir = join(options.home, PROJECTS_DIR);
  mkdirSync(projectsDir, { recursive: true });

  return {
    listProjects() {
      return loadProjects(projectsDir);
    },
  };
}

function loadProjects(projectsDir: string): Project[] {
  const projects: Project[] = [];
  for (const ownerEntry of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!ownerEntry.isDirectory() || ownerEntry.name.startsWith(".")) {
      continue;
    }
    const ownerDir = join(projectsDir, ownerEntry.name);
    for (const nameEntry of readdirSync(ownerDir, { withFileTypes: true })) {
      if (nameEntry.name.startsWith(".")) {
        continue;
      }
      projects.push({ owner: ownerEntry.name, name: nameEntry.name });
    }
  }
  return projects;
}
