import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Platform } from "./platform.ts";
import { renderHomePage } from "./home-page.ts";

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
    const result = await platform.addProject(url);
    if (result.ok) {
      response.writeHead(303, { location: "/" });
      response.end();
      return;
    }
    sendHome(response, platform, { error: result.reason, url });
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
  const html = renderHomePage({
    projects: platform.listProjects(),
    error: extras.error,
    url: extras.url,
  });
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
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
