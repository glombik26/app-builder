import type { Project } from "./platform.ts";

export function renderHomePage(projects: Project[]): string {
  const body =
    projects.length === 0
      ? `<p class="empty">No Projects.</p>`
      : `<ul class="projects">${projects
          .map(
            (project) =>
              `<li><span class="identity">${escapeHtml(project.owner)}/${escapeHtml(project.name)}</span></li>`,
          )
          .join("")}</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Projects</title>
  <style>
    :root {
      --field: #d5dbe3;
      --ink: #1e242c;
      --rule: #7c8694;
      --mark: #0b5f6b;
      --quiet: #4a5360;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: var(--field);
      color: var(--ink);
      font-family: "Avenir Next", "Segoe UI Variable", "Segoe UI", sans-serif;
      font-size: 1.05rem;
      line-height: 1.45;
    }
    main {
      max-width: 42rem;
      margin: 0 auto;
      padding: 3.5rem 1.5rem 4rem;
    }
    header {
      border-bottom: 2px solid var(--ink);
      padding-bottom: 0.7rem;
    }
    h1 {
      margin: 0;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }
    .empty {
      margin: 2.4rem 0 0;
      color: var(--quiet);
      font-size: 1.15rem;
    }
    .projects {
      list-style: none;
      margin: 1.6rem 0 0;
      padding: 0;
    }
    .projects li {
      border-bottom: 1px solid var(--rule);
      padding: 0.7rem 0;
    }
    .identity {
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      font-size: 1rem;
    }
    .mark {
      display: inline-block;
      width: 0.55rem;
      height: 0.55rem;
      margin-right: 0.55rem;
      background: var(--mark);
      vertical-align: 0.05rem;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1><span class="mark" aria-hidden="true"></span>Projects</h1>
    </header>
    ${body}
  </main>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
