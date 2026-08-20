import type { Feature, Project } from "./platform.ts";

export type ProjectPageView = {
  project: Project;
  features: Feature[];
  error?: string;
  name?: string;
};

export function renderProjectPage(view: ProjectPageView): string {
  const identity = `${escapeHtml(view.project.owner)}/${escapeHtml(view.project.name)}`;
  const projectHref = `/projects/${encodeURIComponent(view.project.owner)}/${encodeURIComponent(view.project.name)}`;
  const featuresHref = `${projectHref}/features`;
  const removeAction = `${projectHref}/remove`;
  const body =
    view.features.length === 0
      ? `<p class="empty">No Features.</p>`
      : `<ul class="features">${view.features
          .map((feature) => {
            const href = `${featuresHref}/${encodeURIComponent(feature.name)}`;
            return `<li><a class="identity" href="${escapeHtml(href)}">${escapeHtml(feature.name)}</a></li>`;
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
  <title>${identity}</title>
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
    .identity {
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      font-size: 1rem;
      color: var(--ink);
      text-decoration: none;
    }
    .empty {
      margin: 2.4rem 0 0;
      color: var(--quiet);
      font-size: 1.15rem;
    }
    .features {
      list-style: none;
      margin: 1.6rem 0 0;
      padding: 0;
    }
    .features li {
      border-bottom: 1px solid var(--rule);
      padding: 0.9rem 0;
    }
    .mark {
      display: inline-block;
      width: 0.55rem;
      height: 0.55rem;
      margin-right: 0.55rem;
      background: var(--mark);
      vertical-align: 0.05rem;
    }
    .home {
      display: inline-block;
      margin-bottom: 1.1rem;
      color: var(--quiet);
      font-size: 0.8rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      text-decoration: none;
    }
    .add-feature {
      margin-top: 2.4rem;
      padding-top: 1.4rem;
      border-top: 2px solid var(--ink);
    }
    .add-feature label {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .add-feature input {
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
    .add-feature input:focus {
      outline: none;
      border-bottom-width: 2px;
    }
    .add-feature button {
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
    .remove-project {
      margin-top: 1rem;
    }
    .remove-project button {
      border: 2px solid var(--ink);
      background: transparent;
      color: var(--ink);
      padding: 0.35rem 0.85rem;
      font: inherit;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .error {
      margin: 1.1rem 0 0;
      color: var(--alert);
    }
  </style>
</head>
<body>
  <main>
    <a class="home" href="/">Projects</a>
    <header>
      <h1><span class="mark" aria-hidden="true"></span>${identity}</h1>
      <form class="remove-project" method="post" action="${escapeHtml(removeAction)}">
        <button type="submit">Remove</button>
      </form>
    </header>
    ${error}
    ${body}
    <form class="add-feature" method="post" action="${escapeHtml(featuresHref)}">
      <label for="name">Feature name</label>
      <input id="name" name="name" type="text" autocomplete="off" spellcheck="false" placeholder="login-form" value="${escapeHtml(view.name ?? "")}">
      <button type="submit">Create Feature</button>
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
