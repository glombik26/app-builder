import type { Project } from "./platform.ts";

export type HomePageView = {
  projects: Project[];
  error?: string;
  url?: string;
};

export function renderHomePage(view: HomePageView): string {
  const body =
    view.projects.length === 0
      ? `<p class="empty">No Projects.</p>`
      : `<ul class="projects">${view.projects
          .map((project) => {
            const identity = `${escapeHtml(project.owner)}/${escapeHtml(project.name)}`;
            const action = `/projects/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.name)}/pat`;
            const fieldId = `pat-${encodeURIComponent(project.owner)}-${encodeURIComponent(project.name)}`;
            return `<li>
              <span class="identity">${identity}</span>
              <form class="rotate-pat" method="post" action="${escapeHtml(action)}">
                <label for="${escapeHtml(fieldId)}">Replace PAT</label>
                <input id="${escapeHtml(fieldId)}" name="pat" type="password" autocomplete="off" spellcheck="false" placeholder="Fine-grained PAT">
                <button type="submit">Replace PAT</button>
              </form>
            </li>`;
          })
          .join("")}</ul>`;

  const error = view.error
    ? `<p class="error" role="alert">${escapeHtml(view.error)}</p>`
    : "";

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
      --alert: #8b2e2e;
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
      padding: 0.9rem 0 1.1rem;
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
    .add-project {
      margin-top: 2.4rem;
      padding-top: 1.4rem;
      border-top: 2px solid var(--ink);
    }
    .add-project label,
    .rotate-pat label {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .add-project input,
    .rotate-pat input {
      display: block;
      width: 100%;
      margin: 0.55rem 0 0.9rem;
      padding: 0.55rem 0.15rem;
      border: 0;
      border-bottom: 1px solid var(--ink);
      background: transparent;
      color: var(--ink);
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      font-size: 1rem;
    }
    .add-project input:focus,
    .rotate-pat input:focus {
      outline: none;
      border-bottom-width: 2px;
    }
    .add-project button,
    .rotate-pat button {
      border: 2px solid var(--ink);
      background: var(--ink);
      color: var(--field);
      padding: 0.4rem 0.9rem;
      font: inherit;
      font-size: 0.85rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .rotate-pat {
      margin-top: 0.7rem;
    }
    .rotate-pat input {
      margin: 0.45rem 0 0.7rem;
      padding: 0.45rem 0.15rem;
    }
    .error {
      margin: 1.1rem 0 0;
      color: var(--alert);
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1><span class="mark" aria-hidden="true"></span>Projects</h1>
    </header>
    ${error}
    ${body}
    <form class="add-project" method="post" action="/projects">
      <label for="url">GitHub URL</label>
      <input id="url" name="url" type="text" autocomplete="off" spellcheck="false" placeholder="https://github.com/owner/name" value="${escapeHtml(view.url ?? "")}">
      <label for="pat">PAT (private)</label>
      <input id="pat" name="pat" type="password" autocomplete="off" spellcheck="false" placeholder="Fine-grained PAT">
      <button type="submit">Add Project</button>
    </form>
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
