import type { Feature } from "./platform.ts";

export type FeaturePageView = {
  feature: Feature;
  error?: string;
};

export function renderFeaturePage(view: FeaturePageView): string {
  const feature = view.feature;
  const identity = `${escapeHtml(feature.project.owner)}/${escapeHtml(feature.project.name)}`;
  const projectHref = `/projects/${encodeURIComponent(feature.project.owner)}/${encodeURIComponent(feature.project.name)}`;
  const abortAction = `${projectHref}/features/${encodeURIComponent(feature.name)}/abort`;
  const links =
    feature.preview.links.length === 0
      ? ""
      : `<ul class="preview-links">${feature.preview.links
          .map(
            (link) =>
              `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.service)}</a></li>`,
          )
          .join("")}</ul>`;
  const preview = `<p class="preview">Preview: ${escapeHtml(feature.preview.status)}</p>${links}`;
  const error = view.error
    ? `<p class="error" role="alert">${escapeHtml(view.error)}</p>`
    : "";
  const rail = feature.stages
    .map((stage) => {
      const open = stage === feature.openStage ? ` class="open"` : "";
      return `<li${open}>${escapeHtml(stage)}</li>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(feature.name)}</title>
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
      max-width: 52rem;
      margin: 0 auto;
      padding: 3.5rem 1.5rem 4rem;
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
    .chrome {
      border-bottom: 2px solid var(--ink);
      padding-bottom: 1.1rem;
    }
    .project {
      margin: 0 0 0.35rem;
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      font-size: 0.9rem;
    }
    .project a {
      color: var(--ink);
      text-decoration: none;
    }
    h1 {
      margin: 0;
      font-size: 1.7rem;
      font-weight: 650;
      letter-spacing: -0.03em;
    }
    .preview {
      margin: 0.7rem 0 0;
      color: var(--quiet);
      font-size: 0.92rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .preview-links {
      list-style: none;
      margin: 0.7rem 0 0;
      padding: 0;
    }
    .abort {
      margin-top: 1rem;
    }
    .abort button {
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
    .stages {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 1.1rem;
      list-style: none;
      margin: 1.4rem 0 0;
      padding: 0;
      border-bottom: 1px solid var(--rule);
    }
    .stages li {
      padding: 0.35rem 0 0.7rem;
      color: var(--quiet);
      font-size: 0.78rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .stages li.open {
      color: var(--ink);
      border-bottom: 2px solid var(--mark);
      font-weight: 700;
    }
    .stage-body {
      margin-top: 1.6rem;
    }
    .stage-body h2 {
      margin: 0;
      font-size: 0.78rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .error {
      margin: 1.1rem 0 0;
      color: var(--alert);
    }
  </style>
</head>
<body>
  <main>
    <a class="home" href="${escapeHtml(projectHref)}">${identity}</a>
    <header class="chrome">
      <p class="project"><a href="${escapeHtml(projectHref)}">${identity}</a></p>
      <h1>${escapeHtml(feature.name)}</h1>
      ${preview}
      <form class="abort" method="post" action="${escapeHtml(abortAction)}">
        <button type="submit">Abort</button>
      </form>
    </header>
    ${error}
    <ol class="stages">${rail}</ol>
    <section class="stage-body">
      <h2>${escapeHtml(feature.openStage)}</h2>
    </section>
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
