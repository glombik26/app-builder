import type { DeviceCodeCeremony, Feature, FeatureSlot, SlotEvent, StageId } from "./platform.ts";

export type FeaturePageView = {
  feature: Feature;
  ceremony?: DeviceCodeCeremony;
  error?: string;
  slot?: FeatureSlot;
};

export function renderFeaturePage(view: FeaturePageView): string {
  const feature = view.feature;
  const identity = `${escapeHtml(feature.project.owner)}/${escapeHtml(feature.project.name)}`;
  const projectHref = `/projects/${encodeURIComponent(feature.project.owner)}/${encodeURIComponent(feature.project.name)}`;
  const featureHref = `${projectHref}/features/${encodeURIComponent(feature.name)}`;
  const abortAction = `${featureHref}/abort`;
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
  const ceremony = view.ceremony
    ? `<section class="device-code">
      <h2>Device-code</h2>
      <p>Open this URL on any device, confirm the code, and complete grok-build sign-in. This is not Control-Plane Basic Auth.</p>
      <p class="verification-url"><a href="${escapeHtml(view.ceremony.verificationUrl)}" target="_blank" rel="noreferrer">${escapeHtml(view.ceremony.verificationUrl)}</a></p>
      <p class="user-code">${escapeHtml(view.ceremony.userCode)}</p>
      <form method="post" action="/device-code">
        <input type="hidden" name="return" value="${escapeHtml(featureHref)}">
        <button type="submit">Complete Device-code</button>
      </form>
    </section>`
    : "";
  const rail = feature.stages
    .map((stage) => {
      const classes: string[] = [feature.stageStatuses[stage]];
      if (stage === feature.openStage) {
        classes.push("current");
      }
      return `<li class="${classes.join(" ")}">${escapeHtml(stage)}</li>`;
    })
    .join("");
  const openStatus = feature.stageStatuses[feature.openStage];
  const next = nextStage(feature);
  const actions: string[] = [];
  if (openStatus === "open") {
    actions.push(stageForm(featureHref, feature.openStage, "close", "Close"));
  }
  if (openStatus === "closed") {
    actions.push(stageForm(featureHref, feature.openStage, "reopen", "Reopen"));
    if (next) {
      actions.push(stageForm(featureHref, next, "start", `Start ${next}`));
    }
  }
  const tickets =
    feature.openStage === "implement"
      ? renderTickets(feature, featureHref, openStatus === "open")
      : "";
  const stageActions =
    actions.length === 0 ? "" : `<div class="stage-actions">${actions.join("")}</div>`;
  const harness =
    view.ceremony || !view.slot || feature.openStage !== "grill-with-docs"
      ? ""
      : renderHarness(featureHref, view.slot);

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
    .stages li.open,
    .stages li.current {
      color: var(--ink);
      border-bottom: 2px solid var(--mark);
      font-weight: 700;
    }
    .stages li.locked {
      text-decoration: line-through;
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
    .tickets {
      list-style: none;
      margin: 1.1rem 0 0;
      padding: 0;
    }
    .tickets li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      border-bottom: 1px solid var(--rule);
      padding: 0.7rem 0;
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      font-size: 0.95rem;
    }
    .tickets .closed {
      color: var(--quiet);
    }
    .empty-tickets {
      margin: 1.1rem 0 0;
      color: var(--quiet);
    }
    .stage-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-top: 1.4rem;
    }
    .stage-actions button,
    .tickets button,
    .device-code button {
      border: 2px solid var(--ink);
      background: var(--ink);
      color: var(--field);
      padding: 0.35rem 0.85rem;
      font: inherit;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .device-code {
      margin-top: 1.6rem;
      padding-top: 0.2rem;
    }
    .device-code h2 {
      margin: 0;
      font-size: 0.78rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .device-code p {
      margin: 0.7rem 0 0;
    }
    .verification-url {
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      font-size: 0.92rem;
      overflow-wrap: anywhere;
    }
    .verification-url a {
      color: var(--mark);
    }
    .user-code {
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      font-size: 1.4rem;
      letter-spacing: 0.12em;
      font-weight: 650;
    }
    .device-code form {
      margin-top: 1.1rem;
    }
    .harness {
      margin-top: 1.4rem;
    }
    .turn {
      border-top: 1px solid var(--rule);
      padding: 1.1rem 0 1.2rem;
    }
    .turn-label {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--quiet);
      font-weight: 700;
    }
    .turn-prompt {
      margin: 0.4rem 0 0;
      color: var(--ink);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .turn-work {
      margin: 0.8rem 0 0;
    }
    .turn-work summary {
      cursor: pointer;
      list-style: none;
    }
    .turn-work summary::-webkit-details-marker {
      display: none;
    }
    .work-count {
      color: var(--quiet);
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .work-now {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.4rem;
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      font-size: 0.92rem;
    }
    .work-now::before {
      content: "";
      width: 0.5rem;
      height: 0.5rem;
      flex: none;
      border-radius: 50%;
      background: var(--mark);
      animation: work-pulse 1.2s ease-in-out infinite;
    }
    @keyframes work-pulse {
      50% { opacity: 0.35; }
    }
    .work-log {
      list-style: none;
      margin: 0.55rem 0 0;
      padding: 0;
      color: var(--quiet);
      font-size: 0.88rem;
    }
    .work-log li {
      padding: 0.22rem 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .work-tool {
      font-family: "IBM Plex Mono", "ui-monospace", "SFMono-Regular", Menlo, monospace;
      color: var(--ink);
      font-size: 0.88rem;
    }
    .work-reasoning {
      font-style: italic;
    }
    .turn-answer {
      margin: 0.9rem 0 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .prompt {
      position: sticky;
      bottom: 0;
      margin-top: 1.2rem;
      padding-top: 0.8rem;
      background: var(--field);
    }
    .prompt textarea {
      display: block;
      width: 100%;
      min-height: 6.5rem;
      border: 2px solid var(--ink);
      background: var(--field);
      color: var(--ink);
      padding: 0.6rem 0.7rem;
      font: inherit;
      resize: vertical;
    }
    .prompt-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-top: 0.7rem;
    }
    .prompt button,
    .cancel-turn button {
      border: 2px solid var(--ink);
      background: var(--ink);
      color: var(--field);
      padding: 0.35rem 0.85rem;
      font: inherit;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .prompt button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .cancel-turn button {
      background: transparent;
      color: var(--ink);
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
    ${ceremony}
    <ol class="stages">${rail}</ol>
    <section class="stage-body">
      <h2>${escapeHtml(feature.openStage)}</h2>
      ${harness}
      ${tickets}
      ${stageActions}
    </section>
  </main>
</body>
</html>
`;
}

type TurnWorkStep =
  | { kind: "tool"; title: string; id?: string }
  | { kind: "reasoning"; text: string }
  | { kind: "status"; text: string };

type SlotTurn = {
  prompt: string;
  work: TurnWorkStep[];
  answer: string;
  ended: boolean;
};

function renderHarness(featureHref: string, slot: FeatureSlot): string {
  const disabled = slot.inFlight ? " disabled" : "";
  const cancel = slot.inFlight
    ? `<form class="cancel-turn" method="post" action="${escapeHtml(`${featureHref}/turns/cancel`)}"><button type="submit">Cancel</button></form>`
    : "";
  const turns = groupSlotTurns(slot.events);
  return `<div class="harness">
      <div class="turns">${turns.map((turn, index) => renderTurn(turn, slot.inFlight && index === turns.length - 1)).join("")}</div>
      <form class="prompt" method="post" action="${escapeHtml(`${featureHref}/turns`)}">
        <textarea name="prompt"${disabled}>${escapeHtml(slot.prompt)}</textarea>
        <div class="prompt-actions">
          <button type="submit"${disabled}>Send</button>
          ${cancel}
        </div>
      </form>
    </div>
    <script>
      (() => {
        const events = ${JSON.stringify(slot.events)};
        const root = document.querySelector(".turns");
        const form = document.querySelector(".prompt");
        const box = form && form.querySelector("textarea");
        const send = form && form.querySelector("button[type=submit]");
        const cancel = document.querySelector(".cancel-turn");
        let inFlight = ${slot.inFlight ? "true" : "false"};
        const source = new EventSource(${JSON.stringify(`${featureHref}/events`)});
        source.onmessage = (message) => {
          const event = JSON.parse(message.data);
          events.push(event);
          if (event.kind === "prompt") {
            inFlight = true;
          }
          if (event.kind === "turn_ended") {
            inFlight = false;
            if (box) { box.disabled = false; box.value = ""; }
            if (send) send.disabled = false;
            if (cancel) cancel.remove();
          }
          if (root) {
            root.innerHTML = renderTurns(groupTurns(coalesce(events)), inFlight);
          }
        };
        function coalesce(list) {
          const blocks = [];
          for (const event of list) {
            const last = blocks[blocks.length - 1];
            if (last && last.kind === event.kind && (event.kind === "text" || event.kind === "reasoning" || event.kind === "prompt")) {
              blocks[blocks.length - 1] = { kind: event.kind, text: last.text + event.text };
              continue;
            }
            blocks.push(event);
          }
          return blocks;
        }
        function groupTurns(list) {
          const turns = [];
          let current;
          const open = () => {
            current = { prompt: "", work: [], answer: "", ended: false };
            turns.push(current);
            return current;
          };
          const demote = (turn) => {
            if (turn.answer) {
              turn.work.push({ kind: "status", text: turn.answer });
              turn.answer = "";
            }
          };
          for (const event of list) {
            if (!current || current.ended) {
              open();
            }
            if (event.kind === "prompt") {
              if (current.prompt || current.work.length || current.answer) {
                current.ended = true;
                current = open();
              }
              current.prompt += event.text;
              continue;
            }
            if (event.kind === "text") {
              current.answer += event.text;
              continue;
            }
            if (event.kind === "reasoning") {
              demote(current);
              const last = current.work[current.work.length - 1];
              if (last && last.kind === "reasoning") {
                last.text += event.text;
              } else {
                current.work.push({ kind: "reasoning", text: event.text });
              }
              continue;
            }
            if (event.kind === "tool_call") {
              demote(current);
              const last = current.work[current.work.length - 1];
              if (last && last.kind === "tool" && mergeTool(last, event)) {
                last.title = betterToolTitle(last.title, event.title);
                if (event.id) last.id = event.id;
              } else {
                current.work.push({ kind: "tool", title: event.title, id: event.id });
              }
              continue;
            }
            if (event.kind === "turn_ended") {
              current.ended = true;
            }
          }
          return turns;
        }
        function mergeTool(last, event) {
          if (event.id && last.id === event.id) return true;
          if (event.id || last.id) return false;
          return /^[a-z][a-z0-9_]*$/.test(last.title) && /[\\s/]/.test(event.title);
        }
        function betterToolTitle(a, b) {
          if (!a) return b || "";
          if (!b) return a;
          return b.length >= a.length ? b : a;
        }
        function renderTurns(turns, live) {
          return turns.map((turn, index) => renderTurn(turn, live && index === turns.length - 1)).join("");
        }
        function renderTurn(turn, live) {
          const prompt = turn.prompt
            ? "<p class=\\"turn-label\\">You</p><p class=\\"turn-prompt\\">" + esc(turn.prompt) + "</p>"
            : "";
          const current = live && !turn.answer && turn.work.length
            ? turn.work[turn.work.length - 1]
            : undefined;
          const currentLabel = current
            ? (current.kind === "tool" ? current.title : current.text)
            : (live && !turn.answer ? "Working" : "");
          const now = currentLabel
            ? "<span class=\\"work-now\\">" + esc(currentLabel) + "</span>"
            : "";
          let work = "";
          if (turn.work.length || (live && !turn.answer)) {
            const count = turn.work.length
              ? "Work · " + turn.work.length + (turn.work.length === 1 ? " step" : " steps")
              : "Work";
            const log = turn.work.map((step) => {
              const cls = step.kind === "tool" ? "work-tool" : step.kind === "reasoning" ? "work-reasoning" : "work-status";
              const text = step.kind === "tool" ? step.title : step.text;
              return "<li class=\\"" + cls + "\\">" + esc(text) + "</li>";
            }).join("");
            work = "<details class=\\"turn-work\\"><summary><span class=\\"work-count\\">" + count + "</span>" + now + "</summary><ol class=\\"work-log\\">" + log + "</ol></details>";
          }
          const answer = turn.answer
            ? "<p class=\\"turn-label\\">Reply</p><div class=\\"turn-answer\\">" + esc(turn.answer) + "</div>"
            : "";
          return "<article class=\\"turn\\">" + prompt + work + answer + "</article>";
        }
        function esc(value) {
          return String(value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
        }
      })();
    </script>`;
}

export function groupSlotTurns(events: SlotEvent[]): SlotTurn[] {
  const turns: SlotTurn[] = [];
  let current: SlotTurn | undefined;

  const open = (): SlotTurn => {
    current = { prompt: "", work: [], answer: "", ended: false };
    turns.push(current);
    return current;
  };

  const demote = (turn: SlotTurn): void => {
    if (turn.answer) {
      turn.work.push({ kind: "status", text: turn.answer });
      turn.answer = "";
    }
  };

  for (const event of coalesceStreamEvents(events)) {
    if (!current || current.ended) {
      current = open();
    }
    const turn = current;
    if (event.kind === "prompt") {
      if (turn.prompt || turn.work.length > 0 || turn.answer) {
        turn.ended = true;
        current = open();
      }
      current.prompt += event.text;
      continue;
    }
    if (event.kind === "text") {
      turn.answer += event.text;
      continue;
    }
    if (event.kind === "reasoning") {
      demote(turn);
      const last = turn.work.at(-1);
      if (last?.kind === "reasoning") {
        last.text += event.text;
      } else {
        turn.work.push({ kind: "reasoning", text: event.text });
      }
      continue;
    }
    if (event.kind === "tool_call") {
      demote(turn);
      const last = turn.work.at(-1);
      if (last?.kind === "tool" && mergeToolStep(last, event)) {
        last.title = betterToolTitle(last.title, event.title);
        if (event.id) {
          last.id = event.id;
        }
      } else {
        turn.work.push(
          event.id
            ? { kind: "tool", title: event.title, id: event.id }
            : { kind: "tool", title: event.title },
        );
      }
      continue;
    }
    if (event.kind === "turn_ended") {
      turn.ended = true;
    }
  }
  return turns;
}

function coalesceStreamEvents(events: SlotEvent[]): SlotEvent[] {
  const blocks: SlotEvent[] = [];
  for (const event of events) {
    const last = blocks.at(-1);
    if (last?.kind === "text" && event.kind === "text") {
      blocks[blocks.length - 1] = { kind: "text", text: last.text + event.text };
      continue;
    }
    if (last?.kind === "reasoning" && event.kind === "reasoning") {
      blocks[blocks.length - 1] = { kind: "reasoning", text: last.text + event.text };
      continue;
    }
    if (last?.kind === "prompt" && event.kind === "prompt") {
      blocks[blocks.length - 1] = { kind: "prompt", text: last.text + event.text };
      continue;
    }
    blocks.push(event);
  }
  return blocks;
}

function mergeToolStep(
  last: { kind: "tool"; title: string; id?: string },
  event: { kind: "tool_call"; title: string; id?: string },
): boolean {
  if (event.id && last.id === event.id) {
    return true;
  }
  if (event.id || last.id) {
    return false;
  }
  return /^[a-z][a-z0-9_]*$/.test(last.title) && /[\s/]/.test(event.title);
}

function betterToolTitle(current: string, next: string): string {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  return next.length >= current.length ? next : current;
}

function renderTurn(turn: SlotTurn, live: boolean): string {
  const prompt = turn.prompt
    ? `<p class="turn-label">You</p><p class="turn-prompt">${escapeHtml(turn.prompt)}</p>`
    : "";
  const current = live && !turn.answer && turn.work.length > 0 ? turn.work.at(-1) : undefined;
  const currentLabel = current
    ? current.kind === "tool"
      ? current.title
      : current.text
    : live && !turn.answer
      ? "Working"
      : "";
  const now = currentLabel ? `<span class="work-now">${escapeHtml(currentLabel)}</span>` : "";
  let work = "";
  if (turn.work.length > 0 || (live && !turn.answer)) {
    const count =
      turn.work.length > 0
        ? `Work · ${turn.work.length} ${turn.work.length === 1 ? "step" : "steps"}`
        : "Work";
    const log = turn.work
      .map((step) => {
        const cls =
          step.kind === "tool" ? "work-tool" : step.kind === "reasoning" ? "work-reasoning" : "work-status";
        const text = step.kind === "tool" ? step.title : step.text;
        return `<li class="${cls}">${escapeHtml(text)}</li>`;
      })
      .join("");
    work = `<details class="turn-work"><summary><span class="work-count">${escapeHtml(count)}</span>${now}</summary><ol class="work-log">${log}</ol></details>`;
  }
  const answer = turn.answer
    ? `<p class="turn-label">Reply</p><div class="turn-answer">${escapeHtml(turn.answer)}</div>`
    : "";
  return `<article class="turn">${prompt}${work}${answer}</article>`;
}

function nextStage(feature: Feature): StageId | undefined {
  const index = feature.stages.indexOf(feature.openStage);
  return index === -1 ? undefined : feature.stages[index + 1];
}

function stageForm(featureHref: string, stage: StageId, action: string, label: string): string {
  return `<form method="post" action="${escapeHtml(`${featureHref}/stages/${encodeURIComponent(stage)}/${action}`)}"><button type="submit">${escapeHtml(label)}</button></form>`;
}

function renderTickets(feature: Feature, featureHref: string, canClose: boolean): string {
  if (feature.tickets.length === 0) {
    return `<p class="empty-tickets">No Tickets.</p>`;
  }
  const items = feature.tickets
    .map((ticket) => {
      const status = ticket.closedInImplement ? "closed-in-implement" : "open";
      const close =
        canClose && !ticket.closedInImplement
          ? `<form method="post" action="${escapeHtml(`${featureHref}/tickets/${encodeURIComponent(ticket.name)}/close`)}"><button type="submit">Close ticket</button></form>`
          : "";
      return `<li class="${ticket.closedInImplement ? "closed" : "open"}"><span>${escapeHtml(ticket.name)} · ${status}</span>${close}</li>`;
    })
    .join("");
  return `<ul class="tickets">${items}</ul>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
