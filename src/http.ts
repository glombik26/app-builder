import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { renderFeaturePage } from "./feature-page.ts";
import { renderHomePage } from "./home-page.ts";
import { renderProjectPage } from "./project-page.ts";
import { isStageId, type Platform, type Project } from "./platform.ts";

export type ListenOptions = {
  host: string;
  port: number;
};

const MAX_FORM_BYTES = 8 * 1024;

export function startControlPlane(
  platform: Platform,
  options: ListenOptions,
): Server {
  const server = createServer((request, response) => {
    void handleRequest(platform, request, response).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end("Internal error");
      }
    });
  });

  server.listen(options.port, options.host);
  return server;
}

async function handleRequest(
  platform: Platform,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const path = urlPath(request.url);

  if (request.method === "GET" && path === "/") {
    sendHome(response, platform);
    return;
  }

  if (request.method === "POST" && path === "/projects") {
    const form = await readForm(request);
    if (!form.ok) {
      sendHome(response, platform, { error: form.reason, url: "" });
      return;
    }
    const url = form.fields.get("url") ?? "";
    const pat = form.fields.get("pat") ?? "";
    const result = await platform.addProject(url, pat);
    if (result.ok) {
      response.writeHead(303, { location: "/" });
      response.end();
      return;
    }
    sendHome(response, platform, { error: result.reason, url });
    return;
  }

  const remove = path.match(/^\/projects\/([^/]+)\/([^/]+)\/remove$/);
  if (request.method === "POST" && remove) {
    const owner = decodeURIComponent(remove[1]!);
    const name = decodeURIComponent(remove[2]!);
    const project = findProject(platform, owner, name);
    const result = await platform.removeProject(owner, name);
    if (result.ok) {
      response.writeHead(303, { location: "/" });
      response.end();
      return;
    }
    if (!project) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    sendProject(response, platform, project, { error: result.reason });
    return;
  }

  const rotate = path.match(/^\/projects\/([^/]+)\/([^/]+)\/pat$/);
  if (request.method === "POST" && rotate) {
    const form = await readForm(request);
    if (!form.ok) {
      sendHome(response, platform, { error: form.reason });
      return;
    }
    const owner = decodeURIComponent(rotate[1]!);
    const name = decodeURIComponent(rotate[2]!);
    const result = await platform.replaceProjectPat(owner, name, form.fields.get("pat") ?? "");
    if (result.ok) {
      response.writeHead(303, { location: "/" });
      response.end();
      return;
    }
    sendHome(response, platform, { error: result.reason });
    return;
  }

  const stageAct = path.match(
    /^\/projects\/([^/]+)\/([^/]+)\/features\/([^/]+)\/stages\/([^/]+)\/(close|reopen|start)$/,
  );
  if (request.method === "POST" && stageAct) {
    const owner = decodeURIComponent(stageAct[1]!);
    const name = decodeURIComponent(stageAct[2]!);
    const featureName = decodeURIComponent(stageAct[3]!);
    const stage = decodeURIComponent(stageAct[4]!);
    const action = stageAct[5]!;
    if (!isStageId(stage)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const result =
      action === "close"
        ? await platform.closeStage(owner, name, featureName, stage)
        : action === "reopen"
          ? await platform.reopenStage(owner, name, featureName, stage)
          : await platform.startStage(owner, name, featureName, stage);
    sendFeatureAct(response, platform, owner, name, featureName, result);
    return;
  }

  const closeTicket = path.match(
    /^\/projects\/([^/]+)\/([^/]+)\/features\/([^/]+)\/tickets\/([^/]+)\/close$/,
  );
  if (request.method === "POST" && closeTicket) {
    const owner = decodeURIComponent(closeTicket[1]!);
    const name = decodeURIComponent(closeTicket[2]!);
    const featureName = decodeURIComponent(closeTicket[3]!);
    const ticketName = decodeURIComponent(closeTicket[4]!);
    const result = await platform.closeTicket(owner, name, featureName, ticketName);
    sendFeatureAct(response, platform, owner, name, featureName, result);
    return;
  }

  const abort = path.match(/^\/projects\/([^/]+)\/([^/]+)\/features\/([^/]+)\/abort$/);
  if (request.method === "POST" && abort) {
    const owner = decodeURIComponent(abort[1]!);
    const name = decodeURIComponent(abort[2]!);
    const featureName = decodeURIComponent(abort[3]!);
    const project = findProject(platform, owner, name);
    const result = await platform.abortFeature(owner, name, featureName);
    if (result.ok) {
      if (!project) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      response.writeHead(303, { location: projectPath(project) });
      response.end();
      return;
    }
    const feature = platform.getFeature(owner, name, featureName);
    if (!feature) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    sendHtml(response, renderFeaturePage({ feature, error: result.reason }));
    return;
  }

  const featurePath = path.match(/^\/projects\/([^/]+)\/([^/]+)\/features\/([^/]+)$/);
  if (request.method === "GET" && featurePath) {
    const feature = platform.getFeature(
      decodeURIComponent(featurePath[1]!),
      decodeURIComponent(featurePath[2]!),
      decodeURIComponent(featurePath[3]!),
    );
    if (!feature) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    sendHtml(response, renderFeaturePage({ feature }));
    return;
  }

  const createFeature = path.match(/^\/projects\/([^/]+)\/([^/]+)\/features$/);
  if (request.method === "POST" && createFeature) {
    const owner = decodeURIComponent(createFeature[1]!);
    const name = decodeURIComponent(createFeature[2]!);
    const project = findProject(platform, owner, name);
    const form = await readForm(request);
    const featureName = form.ok ? (form.fields.get("name") ?? "") : "";
    if (!project) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    if (!form.ok) {
      sendProject(response, platform, project, { error: form.reason, name: featureName });
      return;
    }
    const result = await platform.createFeature(owner, name, featureName);
    if (result.ok) {
      response.writeHead(303, {
        location: `${projectPath(project)}/features/${encodeURIComponent(result.feature.name)}`,
      });
      response.end();
      return;
    }
    sendProject(response, platform, project, { error: result.reason, name: featureName });
    return;
  }

  const projectPathMatch = path.match(/^\/projects\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && projectPathMatch) {
    const project = findProject(
      platform,
      decodeURIComponent(projectPathMatch[1]!),
      decodeURIComponent(projectPathMatch[2]!),
    );
    if (!project) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    sendProject(response, platform, project);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function sendHome(
  response: ServerResponse,
  platform: Platform,
  extras: { error?: string; url?: string } = {},
): void {
  sendHtml(
    response,
    renderHomePage({
      projects: platform.listProjects(),
      error: extras.error,
      url: extras.url,
    }),
  );
}

function sendProject(
  response: ServerResponse,
  platform: Platform,
  project: Project,
  extras: { error?: string; name?: string } = {},
): void {
  sendHtml(
    response,
    renderProjectPage({
      project,
      features: platform.listFeatures(project.owner, project.name),
      error: extras.error,
      name: extras.name,
    }),
  );
}

function sendFeatureAct(
  response: ServerResponse,
  platform: Platform,
  owner: string,
  name: string,
  featureName: string,
  result: { ok: true } | { ok: false; reason: string },
): void {
  const feature = platform.getFeature(owner, name, featureName);
  if (!feature) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  if (result.ok) {
    response.writeHead(303, { location: featurePagePath(feature.project, feature.name) });
    response.end();
    return;
  }
  sendHtml(response, renderFeaturePage({ feature, error: result.reason }));
}

function featurePagePath(project: Project, featureName: string): string {
  return `${projectPath(project)}/features/${encodeURIComponent(featureName)}`;
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function findProject(platform: Platform, owner: string, name: string): Project | undefined {
  const ownerKey = owner.toLowerCase();
  const nameKey = name.toLowerCase();
  return platform
    .listProjects()
    .find(
      (project) => project.owner.toLowerCase() === ownerKey && project.name.toLowerCase() === nameKey,
    );
}

function projectPath(project: Project): string {
  return `/projects/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.name)}`;
}

function urlPath(url: string | undefined): string {
  if (!url) {
    return "/";
  }
  const slash = url.indexOf("?");
  return slash === -1 ? url : url.slice(0, slash);
}

async function readForm(
  request: IncomingMessage,
): Promise<{ ok: true; fields: URLSearchParams } | { ok: false; reason: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += piece.length;
    if (size > MAX_FORM_BYTES) {
      request.destroy();
      return { ok: false, reason: "Request is too large." };
    }
    chunks.push(piece);
  }
  return { ok: true, fields: new URLSearchParams(Buffer.concat(chunks).toString("utf8")) };
}
