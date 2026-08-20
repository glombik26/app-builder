import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export type GitCloneRequest = {
  owner: string;
  name: string;
  dest: string;
  credential?: string;
};

export type GitPatRequest = {
  owner: string;
  name: string;
  credential: string;
};

export type GitCloneResult = { ok: true } | { ok: false; reason: string };

export type GitWorktreeRequest = {
  clone: string;
  branch: string;
  worktree: string;
  startPoint?: string;
};

export type GitWorktreeStatus =
  | { ok: true; dirty: boolean }
  | { ok: false; reason: string };

export type GitAdapter = {
  clonePublic(request: GitCloneRequest): Promise<GitCloneResult>;
  cloneWithPat(request: GitCloneRequest & { credential: string }): Promise<GitCloneResult>;
  checkPat(request: GitPatRequest): Promise<GitCloneResult>;
  addFeatureWorktree(request: GitWorktreeRequest): Promise<GitCloneResult>;
  removeFeatureWorktree(request: GitWorktreeRequest): Promise<GitCloneResult>;
  worktreeStatus(request: { worktree: string }): Promise<GitWorktreeStatus>;
};

export type ComposeAdapter = {
  removePreview(request: { composeProject: string }): Promise<void>;
};
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

export type ReplacePatResult = { ok: true } | { ok: false; reason: string };

export type RemoveProjectResult = { ok: true } | { ok: false; reason: string };

export type StageId = "grill-with-docs" | "to-spec" | "to-tickets" | "implement";

export type StageStatus = "upcoming" | "open" | "closed" | "locked";

const FEATURE_STAGES: StageId[] = [
  "grill-with-docs",
  "to-spec",
  "to-tickets",
  "implement",
];

export type FeaturePreview = {
  status: "none";
  links: { service: string; url: string }[];
};

export type FeatureTicket = {
  name: string;
  closedInImplement: boolean;
};

export type Feature = {
  name: string;
  project: Project;
  stages: StageId[];
  openStage: StageId;
  stageStatuses: Record<StageId, StageStatus>;
  tickets: FeatureTicket[];
  preview: FeaturePreview;
};

export type CreateFeatureResult =
  | { ok: true; feature: Feature }
  | { ok: false; reason: string };

export type AbortFeatureResult = { ok: true } | { ok: false; reason: string };

export type FeatureActResult =
  | { ok: true; feature: Feature }
  | { ok: false; reason: string };

export type Platform = {
  listProjects(): Project[];
  addProject(input: string, pat?: string): Promise<AddProjectResult>;
  replaceProjectPat(owner: string, name: string, pat: string): Promise<ReplacePatResult>;
  removeProject(owner: string, name: string): Promise<RemoveProjectResult>;
  listFeatures(owner: string, name: string): Feature[];
  getFeature(owner: string, name: string, featureName: string): Feature | undefined;
  createFeature(owner: string, name: string, featureName: string): Promise<CreateFeatureResult>;
  abortFeature(owner: string, name: string, featureName: string): Promise<AbortFeatureResult>;
  closeStage(owner: string, name: string, featureName: string, stage: StageId): Promise<FeatureActResult>;
  reopenStage(owner: string, name: string, featureName: string, stage: StageId): Promise<FeatureActResult>;
  startStage(owner: string, name: string, featureName: string, stage: StageId): Promise<FeatureActResult>;
  closeTicket(owner: string, name: string, featureName: string, ticketName: string): Promise<FeatureActResult>;
};

const STATE_PROJECTS_DIR = join("state", "projects");
const CLONES_DIR = "clones";
const WORKTREES_DIR = "worktrees";
const FEATURES_DIR = "features";
const NO_PREVIEW: FeaturePreview = { status: "none", links: [] };
const ENVIRONMENT_SLUGS: Record<string, "TEST" | "PROD"> = {
  test: "TEST",
  prod: "PROD",
};

export function emptyAdapters(): Adapters {
  return {
    git: {
      async clonePublic() {
        return { ok: false, reason: "Git adapter is not configured" };
      },
      async cloneWithPat() {
        return { ok: false, reason: "Git adapter is not configured" };
      },
      async checkPat() {
        return { ok: false, reason: "Git adapter is not configured" };
      },
      async addFeatureWorktree() {
        return { ok: false, reason: "Git adapter is not configured" };
      },
      async removeFeatureWorktree() {
        return { ok: false, reason: "Git adapter is not configured" };
      },
      async worktreeStatus() {
        return { ok: false, reason: "Git adapter is not configured" };
      },
    },
    compose: {
      async removePreview() {},
    },
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

  const platform: Platform = {
    listProjects() {
      return loadProjects(recordsDir);
    },
    async addProject(input, pat) {
      const parsed = parseGitHubIdentity(input);
      if (!parsed.ok) {
        return parsed;
      }
      const { owner, name } = parsed.project;
      const existing = findProject(loadProjects(recordsDir), owner, name);
      if (existing) {
        return { ok: false, reason: `A Project ${existing.owner}/${existing.name} already exists.` };
      }
      const credential = pat?.trim() || undefined;
      const dest = join(options.home, CLONES_DIR, owner, name);
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dirname(dest), { recursive: true });
      const clone = credential
        ? await options.adapters.git.cloneWithPat({ owner, name, dest, credential })
        : await options.adapters.git.clonePublic({ owner, name, dest });
      if (!clone.ok) {
        rmSync(dest, { recursive: true, force: true });
        return clone;
      }
      const ownerDir = join(recordsDir, owner);
      mkdirSync(ownerDir, { recursive: true });
      if (credential) {
        writePat(recordsDir, owner, name, credential);
      }
      writeFileSync(join(ownerDir, `${name}.json`), `${JSON.stringify({ owner, name })}\n`);
      return { ok: true, project: { owner, name } };
    },
    async replaceProjectPat(owner, name, pat) {
      const credential = pat.trim();
      if (!credential) {
        return { ok: false, reason: "PAT is required." };
      }
      const existing = findProject(loadProjects(recordsDir), owner, name);
      if (!existing) {
        return { ok: false, reason: `Project ${owner}/${name} does not exist.` };
      }
      const check = await options.adapters.git.checkPat({
        owner: existing.owner,
        name: existing.name,
        credential,
      });
      if (!check.ok) {
        return check;
      }
      writePat(recordsDir, existing.owner, existing.name, credential);
      return { ok: true };
    },
    async removeProject(owner, name) {
      const project = findProject(loadProjects(recordsDir), owner, name);
      if (!project) {
        return { ok: false, reason: `Project ${owner}/${name} does not exist.` };
      }
      for (const feature of loadFeatures(options.home, recordsDir, project)) {
        const aborted = await platform.abortFeature(project.owner, project.name, feature.name);
        if (!aborted.ok) {
          return aborted;
        }
      }
      rmSync(join(options.home, WORKTREES_DIR, project.owner, project.name), {
        recursive: true,
        force: true,
      });
      rmSync(join(options.home, CLONES_DIR, project.owner, project.name), {
        recursive: true,
        force: true,
      });
      rmSync(join(recordsDir, project.owner, `${project.name}.pat`), { force: true });
      rmSync(join(recordsDir, project.owner, project.name), { recursive: true, force: true });
      rmSync(join(recordsDir, project.owner, `${project.name}.json`), { force: true });
      return { ok: true };
    },
    listFeatures(owner, name) {
      const project = findProject(loadProjects(recordsDir), owner, name);
      if (!project) {
        return [];
      }
      return loadFeatures(options.home, recordsDir, project);
    },
    getFeature(owner, name, featureName) {
      const project = findProject(loadProjects(recordsDir), owner, name);
      if (!project) {
        return undefined;
      }
      return loadFeatures(options.home, recordsDir, project).find(
        (feature) => feature.name === featureName,
      );
    },
    async createFeature(owner, name, featureName) {
      const parsed = parseFeatureName(featureName);
      if (!parsed.ok) {
        return parsed;
      }
      const project = findProject(loadProjects(recordsDir), owner, name);
      if (!project) {
        return { ok: false, reason: `Project ${owner}/${name} does not exist.` };
      }
      const existingFeatures = loadFeatures(options.home, recordsDir, project);
      const collision = featureSlugCollision(parsed.name, existingFeatures);
      if (collision) {
        return collision;
      }
      const clone = join(options.home, CLONES_DIR, project.owner, project.name);
      const worktree = join(
        options.home,
        WORKTREES_DIR,
        project.owner,
        project.name,
        parsed.name,
      );
      const branch = featureBranch(parsed.name);
      rmSync(worktree, { recursive: true, force: true });
      mkdirSync(dirname(worktree), { recursive: true });
      const added = await options.adapters.git.addFeatureWorktree({
        clone,
        branch,
        worktree,
        startPoint: "HEAD",
      });
      if (!added.ok) {
        rmSync(worktree, { recursive: true, force: true });
        return added;
      }
      const record = initialFeatureRecord(parsed.name);
      writeFeatureRecord(recordsDir, project, record);
      return { ok: true, feature: viewFeature(options.home, project, record) };
    },
    async abortFeature(owner, name, featureName) {
      const project = findProject(loadProjects(recordsDir), owner, name);
      if (!project) {
        return { ok: false, reason: `Project ${owner}/${name} does not exist.` };
      }
      const feature = loadFeatures(options.home, recordsDir, project).find(
        (item) => item.name === featureName,
      );
      if (!feature) {
        return { ok: false, reason: `Feature ${featureName} does not exist.` };
      }
      await options.adapters.compose.removePreview({
        composeProject: previewComposeProject(project, feature.name),
      });
      const clone = join(options.home, CLONES_DIR, project.owner, project.name);
      const worktree = join(
        options.home,
        WORKTREES_DIR,
        project.owner,
        project.name,
        feature.name,
      );
      const removed = await options.adapters.git.removeFeatureWorktree({
        clone,
        branch: featureBranch(feature.name),
        worktree,
      });
      if (!removed.ok) {
        return removed;
      }
      rmSync(worktree, { recursive: true, force: true });
      rmSync(featureRecordPath(recordsDir, project, feature.name), { force: true });
      return { ok: true };
    },
    async closeStage(owner, name, featureName, stage) {
      const loaded = loadFeatureRecord(recordsDir, owner, name, featureName);
      if (!loaded.ok) {
        return loaded;
      }
      const { project, record } = loaded;
      if (record.openStage !== stage) {
        return { ok: false, reason: `Stage ${stage} is not open.` };
      }
      if (record.closedStages.includes(stage)) {
        return { ok: false, reason: `Stage ${stage} is already closed.` };
      }
      if (stage === "implement") {
        const worktree = featureWorktree(options.home, project, record.name);
        const status = await options.adapters.git.worktreeStatus({ worktree });
        if (!status.ok) {
          return status;
        }
        if (status.dirty) {
          return { ok: false, reason: "implement close is refused because the worktree is dirty." };
        }
        const tickets = listTickets(worktree, record.closedInImplement);
        if (tickets.some((ticket) => !ticket.closedInImplement)) {
          return {
            ok: false,
            reason: "implement close is refused because a Ticket is not closed-in-implement.",
          };
        }
      }
      const next = {
        ...record,
        closedStages: [...record.closedStages, stage],
      };
      writeFeatureRecord(recordsDir, project, next);
      return { ok: true, feature: viewFeature(options.home, project, next) };
    },
    async reopenStage(owner, name, featureName, stage) {
      const loaded = loadFeatureRecord(recordsDir, owner, name, featureName);
      if (!loaded.ok) {
        return loaded;
      }
      const { project, record } = loaded;
      if (!record.closedStages.includes(stage)) {
        return { ok: false, reason: `Stage ${stage} is not closed.` };
      }
      if (laterStageHasStarted(record, stage)) {
        return {
          ok: false,
          reason: `Stage ${stage} is locked because the next Stage has started.`,
        };
      }
      const next = {
        ...record,
        openStage: stage,
        closedStages: record.closedStages.filter((item) => item !== stage),
      };
      writeFeatureRecord(recordsDir, project, next);
      return { ok: true, feature: viewFeature(options.home, project, next) };
    },
    async startStage(owner, name, featureName, stage) {
      const loaded = loadFeatureRecord(recordsDir, owner, name, featureName);
      if (!loaded.ok) {
        return loaded;
      }
      const { project, record } = loaded;
      if (record.startedStages.includes(stage)) {
        return { ok: false, reason: `Stage ${stage} has already started.` };
      }
      const index = FEATURE_STAGES.indexOf(stage);
      if (index <= 0) {
        return { ok: false, reason: `Stage ${stage} has already started.` };
      }
      const previous = FEATURE_STAGES[index - 1]!;
      if (!record.closedStages.includes(previous)) {
        return {
          ok: false,
          reason: `Stage ${stage} cannot start until ${previous} is closed.`,
        };
      }
      if (record.startedStages[record.startedStages.length - 1] !== previous) {
        return { ok: false, reason: `Stage ${stage} is not next.` };
      }
      const next = {
        ...record,
        openStage: stage,
        startedStages: [...record.startedStages, stage],
      };
      writeFeatureRecord(recordsDir, project, next);
      return { ok: true, feature: viewFeature(options.home, project, next) };
    },
    async closeTicket(owner, name, featureName, ticketName) {
      const loaded = loadFeatureRecord(recordsDir, owner, name, featureName);
      if (!loaded.ok) {
        return loaded;
      }
      const { project, record } = loaded;
      if (record.openStage !== "implement" || record.closedStages.includes("implement")) {
        return { ok: false, reason: "implement is not open." };
      }
      const worktree = featureWorktree(options.home, project, record.name);
      const tickets = listTickets(worktree, record.closedInImplement);
      const ticket = tickets.find((item) => item.name === ticketName);
      if (!ticket) {
        return { ok: false, reason: `Ticket ${ticketName} does not exist.` };
      }
      if (ticket.closedInImplement) {
        return { ok: false, reason: `Ticket ${ticketName} is already closed-in-implement.` };
      }
      const next = {
        ...record,
        closedInImplement: [...record.closedInImplement, ticketName],
      };
      writeFeatureRecord(recordsDir, project, next);
      return { ok: true, feature: viewFeature(options.home, project, next) };
    },
  };
  return platform;
}

function writePat(recordsDir: string, owner: string, name: string, credential: string): void {
  const path = join(recordsDir, owner, `${name}.pat`);
  writeFileSync(path, `${credential}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
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

function parseFeatureName(input: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = input.trim();
  if (!name) {
    return { ok: false, reason: "Feature name is empty or illegal." };
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(name) || name.includes("..") || name.endsWith(".lock")) {
    return { ok: false, reason: "Feature name is empty or illegal." };
  }
  const slug = slugify(name);
  if (!slug || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return { ok: false, reason: "Feature name is empty or illegal." };
  }
  return { ok: true, name };
}

function featureSlugCollision(
  featureName: string,
  existing: Feature[],
): { ok: false; reason: string } | undefined {
  const slug = slugify(featureName);
  const environment = ENVIRONMENT_SLUGS[slug];
  if (environment) {
    return {
      ok: false,
      reason: `A Feature ${featureName} would slug to the same hostname or Compose-project label as the ${environment} Environment of this Project.`,
    };
  }
  const other = existing.find((feature) => slugify(feature.name) === slug);
  if (!other) {
    return undefined;
  }
  if (other.name === featureName) {
    return { ok: false, reason: `A Feature ${featureName} already exists.` };
  }
  return {
    ok: false,
    reason: `A Feature ${featureName} would slug to the same hostname or Compose-project label as ${other.name}.`,
  };
}

type FeatureRecord = {
  name: string;
  openStage: StageId;
  startedStages: StageId[];
  closedStages: StageId[];
  closedInImplement: string[];
};

function initialFeatureRecord(name: string): FeatureRecord {
  return {
    name,
    openStage: "grill-with-docs",
    startedStages: ["grill-with-docs"],
    closedStages: [],
    closedInImplement: [],
  };
}

function parseFeatureRecord(raw: unknown): FeatureRecord | undefined {
  if (!raw || typeof raw !== "object" || !("name" in raw) || typeof raw.name !== "string") {
    return undefined;
  }
  const recorded = raw as Partial<FeatureRecord> & { name: string };
  return {
    name: recorded.name,
    openStage: isStageId(recorded.openStage) ? recorded.openStage : "grill-with-docs",
    startedStages: Array.isArray(recorded.startedStages)
      ? recorded.startedStages.filter(isStageId)
      : ["grill-with-docs"],
    closedStages: Array.isArray(recorded.closedStages) ? recorded.closedStages.filter(isStageId) : [],
    closedInImplement: Array.isArray(recorded.closedInImplement)
      ? recorded.closedInImplement.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function isStageId(value: unknown): value is StageId {
  return FEATURE_STAGES.includes(value as StageId);
}

function viewFeature(home: string, project: Project, record: FeatureRecord): Feature {
  return {
    name: record.name,
    project,
    stages: [...FEATURE_STAGES],
    openStage: record.openStage,
    stageStatuses: deriveStageStatuses(record),
    tickets: listTickets(featureWorktree(home, project, record.name), record.closedInImplement),
    preview: { ...NO_PREVIEW, links: [] },
  };
}

function deriveStageStatuses(record: FeatureRecord): Record<StageId, StageStatus> {
  const statuses = {} as Record<StageId, StageStatus>;
  for (const [index, stage] of FEATURE_STAGES.entries()) {
    const laterStarted = FEATURE_STAGES.slice(index + 1).some((item) =>
      record.startedStages.includes(item),
    );
    if (laterStarted && record.startedStages.includes(stage)) {
      statuses[stage] = "locked";
    } else if (record.closedStages.includes(stage)) {
      statuses[stage] = "closed";
    } else if (stage === record.openStage) {
      statuses[stage] = "open";
    } else {
      statuses[stage] = "upcoming";
    }
  }
  return statuses;
}

function laterStageHasStarted(record: FeatureRecord, stage: StageId): boolean {
  const index = FEATURE_STAGES.indexOf(stage);
  return FEATURE_STAGES.slice(index + 1).some((item) => record.startedStages.includes(item));
}

function listTickets(worktree: string, closedInImplement: string[]): FeatureTicket[] {
  const dir = join(worktree, ".scratch", "issues");
  if (!existsSync(dir)) {
    return [];
  }
  const tickets: FeatureTicket[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }
    tickets.push({
      name: entry.name,
      closedInImplement: closedInImplement.includes(entry.name),
    });
  }
  return tickets.sort((a, b) => a.name.localeCompare(b.name));
}

function loadFeatures(home: string, recordsDir: string, project: Project): Feature[] {
  const dir = featuresDir(recordsDir, project);
  if (!existsSync(dir)) {
    return [];
  }
  const features: Feature[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const record = parseFeatureRecord(JSON.parse(readFileSync(join(dir, entry.name), "utf8")));
    if (!record) {
      continue;
    }
    features.push(viewFeature(home, project, record));
  }
  return features.sort((a, b) => a.name.localeCompare(b.name));
}

function writeFeatureRecord(recordsDir: string, project: Project, record: FeatureRecord): void {
  const dir = featuresDir(recordsDir, project);
  mkdirSync(dir, { recursive: true });
  writeFileSync(featureRecordPath(recordsDir, project, record.name), `${JSON.stringify(record)}\n`);
}

function loadFeatureRecord(
  recordsDir: string,
  owner: string,
  name: string,
  featureName: string,
): { ok: true; project: Project; record: FeatureRecord } | { ok: false; reason: string } {
  const project = findProject(loadProjects(recordsDir), owner, name);
  if (!project) {
    return { ok: false, reason: `Project ${owner}/${name} does not exist.` };
  }
  const path = featureRecordPath(recordsDir, project, featureName);
  if (!existsSync(path)) {
    return { ok: false, reason: `Feature ${featureName} does not exist.` };
  }
  const record = parseFeatureRecord(JSON.parse(readFileSync(path, "utf8")));
  if (!record || record.name !== featureName) {
    return { ok: false, reason: `Feature ${featureName} does not exist.` };
  }
  return { ok: true, project, record };
}

function featureWorktree(home: string, project: Project, featureName: string): string {
  return join(home, WORKTREES_DIR, project.owner, project.name, featureName);
}

function featuresDir(recordsDir: string, project: Project): string {
  return join(recordsDir, project.owner, project.name, FEATURES_DIR);
}

function featureRecordPath(recordsDir: string, project: Project, featureName: string): string {
  return join(featuresDir(recordsDir, project), `${slugify(featureName)}.json`);
}

function featureBranch(featureName: string): string {
  return `feature/${featureName}`;
}

function previewComposeProject(project: Project, featureName: string): string {
  return `ab-${slugify(project.owner)}-${slugify(project.name)}-dev-${slugify(featureName)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
