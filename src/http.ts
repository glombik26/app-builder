import { createServer, type Server } from "node:http";
import type { Platform } from "./platform.ts";
import { renderHomePage } from "./home-page.ts";

export type ListenOptions = {
  host: string;
  port: number;
};

export function startControlPlane(
  platform: Platform,
  options: ListenOptions,
): Server {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || (request.url !== "/" && request.url !== "")) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const html = renderHomePage(platform.listProjects());
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });

  server.listen(options.port, options.host);
  return server;
}
