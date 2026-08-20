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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --canvas: #0a0a0b;
      --elevated: #141416;
      --bubble: #262628;
      --ink: #ececee;
      --muted: #8d8d92;
      --hair: rgba(255, 255, 255, 0.09);
      --send: #f4f4f5;
      --send-ink: #0a0a0b;
      --alert: #ff7b72;
      --live: #d4d4d8;
      --field: var(--canvas);
      --quiet: var(--muted);
      --rule: var(--hair);
      --mark: var(--live);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    html { color-scheme: dark; }
    body {
      min-height: 100vh;
      background: var(--canvas);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 1.02rem;
      line-height: 1.55;
    }
    main {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      max-width: 48rem;
      margin: 0 auto;
      padding: 0 1.15rem 0;
    }
    .home {
      display: none;
    }
    .chrome {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "project abort"
        "title abort"
        "preview abort";
      gap: 0.15rem 1rem;
      align-items: start;
      position: sticky;
      top: 0;
      z-index: 2;
      margin: 0 -1.15rem;
      padding: 0.85rem 1.15rem 0.75rem;
      background: linear-gradient(180deg, var(--canvas) 70%, transparent);
    }
    .project {
      grid-area: project;
      margin: 0;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 500;
    }
    .project a {
      color: inherit;
      text-decoration: none;
    }
    .project a:hover { color: var(--ink); }
    h1 {
      grid-area: title;
      margin: 0;
      font-size: 0.98rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .preview {
      grid-area: preview;
      margin: 0.15rem 0 0;
      color: var(--muted);
      font-size: 0.75rem;
    }
    .preview-links {
      list-style: none;
      margin: 0.35rem 0 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .preview-links a {
      color: var(--ink);
      text-decoration: none;
      border: 1px solid var(--hair);
      border-radius: 999px;
      padding: 0.15rem 0.55rem;
      font-size: 0.72rem;
    }
    .abort {
      grid-area: abort;
      margin: 0;
    }
    .abort button,
    .stage-actions button,
    .tickets button,
    .device-code button,
    .cancel-turn button {
      border: 1px solid var(--hair);
      background: transparent;
      color: var(--ink);
      padding: 0.38rem 0.8rem;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 500;
      border-radius: 999px;
      cursor: pointer;
    }
    .abort button:hover,
    .stage-actions button:hover,
    .tickets button:hover,
    .device-code button:hover,
    .cancel-turn button:hover {
      background: var(--elevated);
    }
    .stages {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      list-style: none;
      margin: 0.2rem 0 0;
      padding: 0 0 0.9rem;
    }
    .stages li {
      padding: 0.22rem 0.65rem;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 500;
      border-radius: 999px;
    }
    .stages li.open,
    .stages li.current {
      color: var(--ink);
      background: var(--elevated);
    }
    .stages li.locked {
      text-decoration: line-through;
      opacity: 0.55;
    }
    .stage-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .stage-body h2 {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--muted);
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
      border-bottom: 1px solid var(--hair);
      padding: 0.7rem 0;
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-size: 0.9rem;
    }
    .tickets .closed { color: var(--muted); }
    .empty-tickets {
      margin: 1.1rem 0 0;
      color: var(--muted);
    }
    .stage-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 1.2rem;
    }
    .device-code {
      margin-top: 1.2rem;
      padding: 1rem 1.1rem;
      background: var(--elevated);
      border: 1px solid var(--hair);
      border-radius: 1.1rem;
    }
    .device-code h2 {
      margin: 0;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--ink);
    }
    .device-code p { margin: 0.7rem 0 0; }
    .verification-url {
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-size: 0.88rem;
      overflow-wrap: anywhere;
    }
    .verification-url a { color: var(--ink); }
    .user-code {
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-size: 1.35rem;
      letter-spacing: 0.1em;
      font-weight: 600;
    }
    .device-code form { margin-top: 1rem; }
    .harness {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin-top: 0.6rem;
    }
    .turns {
      flex: 1;
      padding: 0.4rem 0 1.2rem;
    }
    .turn {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      padding: 0.85rem 0 1.15rem;
    }
    .turn-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    .turn-user {
      display: flex;
      justify-content: flex-end;
    }
    .turn-prompt {
      margin: 0;
      max-width: min(36rem, 86%);
      padding: 0.7rem 0.95rem;
      background: var(--bubble);
      border-radius: 1.35rem 1.35rem 0.4rem 1.35rem;
      color: var(--ink);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 0.98rem;
      line-height: 1.45;
    }
    .turn-work {
      margin: 0;
      max-width: 38rem;
    }
    .turn-work summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem 0.7rem;
      cursor: pointer;
      list-style: none;
      color: var(--muted);
    }
    .turn-work summary::-webkit-details-marker { display: none; }
    .turn-work summary::before {
      content: "";
      width: 0.45rem;
      height: 0.45rem;
      border-right: 1.5px solid var(--muted);
      border-bottom: 1.5px solid var(--muted);
      transform: rotate(-45deg);
      transition: transform 0.15s ease;
    }
    .turn-work[open] summary::before { transform: rotate(45deg); }
    .work-count {
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 500;
    }
    .work-now {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      color: var(--live);
      font-size: 0.82rem;
    }
    .work-now::before {
      content: "";
      width: 0.42rem;
      height: 0.42rem;
      flex: none;
      border-radius: 50%;
      background: var(--live);
      animation: work-pulse 1.2s ease-in-out infinite;
    }
    @keyframes work-pulse {
      50% { opacity: 0.28; }
    }
    .work-log {
      list-style: none;
      margin: 0.45rem 0 0;
      padding: 0.15rem 0 0.2rem 1.05rem;
      border-left: 1px solid var(--hair);
      color: var(--muted);
      font-size: 0.84rem;
    }
    .work-log li {
      padding: 0.18rem 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .work-tool {
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      color: #c8c8cc;
      font-size: 0.8rem;
    }
    .work-reasoning { font-style: italic; }
    .turn-answer {
      margin: 0;
      max-width: 40rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 1.02rem;
      line-height: 1.6;
      font-weight: 400;
    }
    .composer-dock {
      position: sticky;
      bottom: 0;
      z-index: 2;
      margin: auto -0.2rem 0;
      padding: 0.55rem 0.2rem 1.05rem;
      background: linear-gradient(180deg, transparent, var(--canvas) 2.1rem);
    }
    .prompt {
      margin: 0;
    }
    .composer {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      padding: 0.5rem 0.5rem 0.5rem 1.05rem;
      background: var(--elevated);
      border: 1px solid var(--hair);
      border-radius: 1.7rem;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
    }
    .prompt textarea {
      display: block;
      flex: 1;
      width: 100%;
      min-height: 1.55rem;
      max-height: 12rem;
      border: 0;
      background: transparent;
      color: var(--ink);
      padding: 0.45rem 0;
      font: inherit;
      font-size: 1rem;
      line-height: 1.45;
      resize: none;
      outline: none;
    }
    .prompt textarea::placeholder { color: var(--muted); }
    .prompt-actions {
      display: flex;
      align-items: flex-end;
      gap: 0.4rem;
    }
    .prompt button[type="submit"] {
      flex: none;
      width: 2.15rem;
      height: 2.15rem;
      border: 0;
      border-radius: 999px;
      background: var(--send);
      color: transparent;
      font-size: 0;
      cursor: pointer;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230a0a0b' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='M12 19V5'/><path d='M5 12l7-7 7 7'/></svg>");
      background-repeat: no-repeat;
      background-position: center;
      background-size: 1.05rem;
    }
    .prompt button[type="submit"]:disabled {
      opacity: 0.28;
      cursor: not-allowed;
    }
    .cancel-turn {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.55rem;
    }
    .error {
      margin: 0.4rem 0 0;
      color: var(--alert);
      font-size: 0.92rem;
    }
    @media (max-width: 640px) {
      main { padding: 0 0.85rem; }
      .chrome { margin: 0 -0.85rem; padding: 0.75rem 0.85rem 0.65rem; }
      .turn-prompt { max-width: 92%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .work-now::before { animation: none; }
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
      <div class="composer-dock">
      <form class="prompt" method="post" action="${escapeHtml(`${featureHref}/turns`)}">
        <div class="composer">
          <textarea name="prompt"${disabled}>${escapeHtml(slot.prompt)}</textarea>
          <div class="prompt-actions">
            <button type="submit"${disabled}>Send</button>
          </div>
        </div>
      </form>
      ${cancel}
      </div>
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
            if (box) { box.disabled = false; box.value = ""; grow(); }
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
        function grow() {
          if (!box) return;
          box.style.height = "auto";
          box.style.height = Math.min(box.scrollHeight, 192) + "px";
        }
        if (box) {
          grow();
          box.addEventListener("input", grow);
          box.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              if (!inFlight && form) form.requestSubmit();
            }
          });
        }
        function renderTurn(turn, live) {
          const prompt = turn.prompt
            ? "<p class=\\"turn-label\\">You</p><div class=\\"turn-user\\"><p class=\\"turn-prompt\\">" + esc(turn.prompt) + "</p></div>"
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
    ? `<p class="turn-label">You</p><div class="turn-user"><p class="turn-prompt">${escapeHtml(turn.prompt)}</p></div>`
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
