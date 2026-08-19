Part of #1

## Problem Statement

The Operator has one VPS and one grok-build subscription, and wants a Control Plane that develops software on GitHub Projects through a Guided Workflow (grill-with-docs → to-spec → to-tickets → implement), with a Preview per Feature on DEV and an explicit Freigabe path DEV → TEST → PROD. The predecessor stack on another host is production for other apps and must not be reframed or migrated here. Decisions are locked as ADRs; what is missing is one written spec an implementer can build against.

## Solution

The Platform (`app-builder`) is that Control Plane. There is exactly one Operator. Home is the Project list. A Project is a GitHub `owner/name` the Platform has cloned. A Feature is a Platform-owned unit of work with a Guided Workflow, a local branch and worktree during development, and a Preview while the worktree can run. The Operator closes every Stage; the Harness never advances the Feature. After implement is closed, Freigabe DEV→TEST merges onto `main` and tears down the Preview, worktree, and Feature branch. TEST is the integration stand of `main`. Freigabe TEST→PROD fast-forwards `release`. Preview, TEST, and PROD are Compose projects behind one Traefik.

The first implementable cut is Projects + Guided Workflow (Harness wrapper) + DEV Previews, including the stage-led Operator surface. TEST, PROD, Freigabe, tracking-ref Apply, Environment Secrets, and File Secrets are specified here and follow as later slices of the same spec.

## User Stories

1. As the Operator, I want to open the Platform in a browser on two networks without the VPS SSH key, so that I can run Features from wherever I work.
2. As the Operator, I want the Control Plane at `https://platform.glombik26.de` behind one HTTP Basic secret, so that a passer-by cannot merge to `main` or Freigabe to PROD.
3. As the Operator, I want HTTPS with HTTP redirect on the Control Plane, so that the secret is not sent in the clear.
4. As the Operator, I want a single shared Basic-Auth secret and no second identity, so that the surface stays a one-Operator tool.
5. As the Operator, I want Device-code to remain the Grok subscription ceremony, so that Control-Plane access and Harness login stay different acts.
6. As the Operator, I want Home to be the Project list, so that I start from the things I develop against, not from a cross-Project inbox.
7. As the Operator, I want to add a public Project by GitHub URL, so that the Platform can clone it without a credential.
8. As the Operator, I want to add a private Project by GitHub URL plus a fine-grained PAT that belongs only to that Project, so that a leaked credential is one `owner/name`, not my whole GitHub.
9. As the Operator, I want the Platform to have no Platform-wide GitHub token, so that Projects do not share blast radius.
10. As the Operator, I want a Project to exist only after a successful clone of its default branch, so that a listed Project is something the Platform can develop against.
11. As the Operator, I want the Project identity to be `owner/name` and not to change, so that records, paths, slugs, and URLs stay stable.
12. As the Operator, I want to add many Projects, so that one Platform can serve every repository I develop.
13. As the Operator, I want a duplicate `owner/name` to be refused, so that I do not get two records for one clone.
14. As the Operator, I want a failed clone to stay off the list and show why, so that I can fix the URL or PAT.
15. As the Operator, I want to replace a Project's PAT, so that I can rotate the credential without removing the Project.
16. As the Operator, I want to remove a Project, so that its record, PAT, Environment Secrets, File Secret trees, clone, worktrees, Feature records, and TEST/PROD stacks leave the VPS.
17. As the Operator, I want to create a Feature with a name I choose, unique within that Project and immutable, so that I can find it later and the name cannot drift.
18. As the Operator, I want a new Feature to start from the Project's default branch as one local branch and one worktree of the single Project clone, so that Features are isolated without a second clone or a remote branch.
19. As the Operator, I want a Feature that would slug to the same hostname or Compose-project label as another Feature or Environment of that Project to be refused, so that Preview and Environment URLs stay unique.
20. As the Operator, I want an empty or illegal Feature name to be refused, so that Git and DNS never see a broken identity.
21. As the Operator, I want several Features open on one Project at once, so that I can grill one idea while another is in implement.
22. As the Operator, I want abort to delete that Feature's worktree, local branch, Preview (including named volumes), and record, so that the name is free and other Features and the Project clone stay.
23. As the Operator, I want abort to leave GitHub dark, so that unfinished work never appears as a branch or PR.
24. As the Operator, I want a Feature screen with chrome (name, Preview status and links, abort, Freigabe DEV→TEST when allowed), a rail of the four Stages, and the open Stage's body, so that Stage is the lockable gate I work in.
25. As the Operator, I want the four Stages to be grill-with-docs, to-spec, to-tickets, and implement, so that every Feature follows the same Guided Workflow.
26. As the Operator, I want to close a Stage myself, so that the Platform never advances because an artifact appeared.
27. As the Operator, I want to reopen a closed Stage until the next Stage has started, so that I can correct a handoff I just accepted.
28. As the Operator, I want a Stage to lock once the next Stage has started, so that I cannot silently stale later work; the only way back is abort.
29. As the Operator, I want grill-with-docs and to-spec to share one Harness session, so that to-spec can synthesize that conversation.
30. As the Operator, I want to-tickets to start a fresh session that reads only the Feature worktree, so that grill chatter does not ride into Tickets.
31. As the Operator, I want implement to be a shell of Tickets, not one session for the Feature, so that each Ticket has its own Slot.
32. As the Operator, I want at most one implement Ticket session at a time on a Feature, so that two writers do not share one worktree.
33. As the Operator, I want to pick the next Ticket from the unblocked frontier, so that I control order inside implement.
34. As the Operator, I want implement to close only when every Ticket is closed-in-implement and the worktree is clean, so that Freigabe DEV→TEST never starts from a dirty tree.
35. As the Operator, I want a dirty worktree to refuse implement close, so that I am forced to finish or discard leftover edits.
36. As the Operator, I want spec and Tickets to live as files in the Feature worktree (`.scratch/`), not as issues on the Project, so that GitHub stays dark until Freigabe.
37. As the Operator, I want the first Turn of a Slot (and the grill-with-docs → to-spec gate) to sit in the prompt box as a prefilled skill slash (`/grill-with-docs <Feature name>`, `/to-spec`, `/to-tickets`, `/implement .scratch/issues/<file>`), so that I start the right Stage without inventing a prompt.
38. As the Operator, I want to edit that prefill and be the one who sends it, so that the Platform never spends a Turn I did not order.
39. As the Operator, I want later Turns on the same Slot to start as an empty box, so that I am not re-kicked every time.
40. As the Operator, I want reopening an unlocked Stage to continue the same session with no new kickoff, so that I resume the conversation.
41. As the Operator, I want reopening a Ticket to be a new Slot with the implement prefill again, so that each implement session is a fresh Harness conversation on that Ticket.
42. As the Operator, I want a Turn to be one prompt until the Harness reports the turn has ended, so that I know when I may speak again.
43. As the Operator, I want to see the Harness stream (text, tool calls, reasoning) on the open Stage, so that I can follow the work.
44. As the Operator, I want to cancel an in-flight Turn, so that I can stop a runaway session without aborting the Feature.
45. As the Operator, I want HITL to be the next prompt after `stopReason`, plus cancel — not mid-turn permission cards, `ask_user_question`, or plan approval — so that I only answer when the Turn is over.
46. As the Operator, I want a live Slot to be attached, never spawned twice, so that two tabs cannot fork the same conversation.
47. As the Operator, I want the live Harness process to exist only for that Turn, so that a reboot or a closed tab does not leave an idle agent.
48. As the Operator, I want history after a new process to come from `session/load` replay, so that there is one transcript (the Harness's), not a Platform copy.
49. As the Operator, I want Features to run Turns in parallel, with the existing one-implement-Ticket-per-Feature rule, so that one Feature's Turn does not lock the Platform.
50. As the Operator, I want a Device-code ceremony on the Platform when the subscription is missing, so that I can sign grok-build in without putting an API key in the Platform.
51. As the Operator, I want that ceremony to block the surface that needs the Harness, so that I am not staring at a dead Slot.
52. As the Operator, I want the token to stay in `~/.grok/auth.json` and refresh there, so that the Platform does not become a second secret store for the subscription.
53. As the Operator, I want every Harness session to run always-approve with the same thin English `_meta.rules` (no mid-turn cards; Operator answers after `stopReason`), so that Stage behaviour lives in the skills, not in a fat Platform prompt.
54. As the Operator, I want adapted copies of the four Stage skills installed once under the Platform user, so that every Project sees the same files and `/implement` is the Platform Ticket skill, not the bundled orchestrator.
55. As the Operator, I want those skills to write `.scratch/spec.md` and `.scratch/issues/` and not to commit, so that the Platform owns every commit on the Feature branch.
56. As the Operator, I want closing a Ticket in implement to stage every non-ignored change and commit with a Platform author and the Ticket name as message, so that each closed Ticket is a snapshot I can rebuild a Preview from.
57. As the Operator, I want no commit when there is no diff, so that empty closes do not pollute the branch.
58. As the Operator, I want reopening a Ticket and closing it again to stack another commit, with no amend and no rewind, so that history is append-only.
59. As the Operator, I want `.scratch/` kept off the Feature branch via the Project `.gitignore` (the Platform adds the line if missing), so that handoffs never leave the VPS as Git history.
60. As the Operator, I want a fixed secret-path list (`.env`, `.env.*` except example/sample/template, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `id_ecdsa`, plus any DEV File-Secret destinations) appended to that `.gitignore` on Ticket close, so that implement does not commit secrets it can see on disk.
61. As the Operator, I want already-tracked files left alone and no content scan, so that close never silently unstages or refuses merely because a listed path exists.
62. As the Operator, I want the Feature branch never pushed and no PR opened, so that GitHub first sees the work when Freigabe DEV→TEST merges onto `origin/main`.
63. As the Operator, I want a Preview to start automatically the first time the Feature worktree meets the Compose contract, so that I get a URL without a second ceremony.
64. As the Operator, I want the Guided Workflow to run even when the worktree has no Compose contract, so that I can still grill and implement a Project that cannot yet preview.
65. As the Operator, I want the contract to be one root Compose file found by Compose's default names, started with an explicit `-f`, with `compose.override.yaml` ignored, so that the Project authors one file for Preview, TEST, and PROD.
66. As the Operator, I want each public HTTP service marked `app-builder.public=true`, so that databases with `ports:` are not published.
67. As the Operator, I want the Platform to inject Traefik labels, the shared proxy network, and `ENVIRONMENT=dev|test|prod`, and to `!reset` host `ports:`, so that the Project compose does not leak the edge.
68. As the Operator, I want `container_name`, `network_mode: host`, and absolute host bind mounts to fail the contract, so that stacks stay isolatable Compose projects.
69. As the Operator, I want a missing `.env` not to fail the contract, so that a Project without committed env still previews.
70. As the Operator, I want each public HTTP service of a Preview at `https://<service>--<feature>--<project-slug>.dev.glombik26.de`, so that I can open the real origin in a new tab.
71. As the Operator, I want a label that would exceed 63 characters to become a short Platform id, so that DNS still works.
72. As the Operator, I want two names that slug to the same label to be refused at create, so that I am not surprised by a collision later.
73. As the Operator, I want Preview URLs to have no Platform HTTP gate, so that I can share a link and so webhooks and OAuth callbacks on a public service still work.
74. As the Operator, I want HTTPS with a single Traefik ACME DNS-01 wildcard `*.dev.glombik26.de` via IONOS, so that I do not burn the shared Let's Encrypt weekly limit with per-hostname certs.
75. As the Operator, I want a Preview to start only when fewer than N Previews run platform-wide and `MemAvailable` is at least 2 GiB, so that TEST, PROD, and Traefik are not OOM victims.
76. As the Operator, I want N to default to 4, live in a file under Platform-home, be an integer ≥ 1, and have no hard maximum, so that I can raise it after I see real headroom.
77. As the Operator, I want the first-cut surface not to edit N, so that a rare knob stays a file.
78. As the Operator, I want a refused start to leave the Feature and Guided Workflow running without a Preview, and to show why on the Feature, so that I know whether to stop another Preview or free RAM.
79. As the Operator, I want Home to show `k/N` running Previews, so that I see the door before I open another Feature.
80. As the Operator, I want TEST and PROD outside N and never displaced by a Preview, so that standing Environments outrank Feature stacks.
81. As the Operator, I want lowering N not to stop stacks that already run, so that the gate is a door, not a bouncer.
82. As the Operator, I want no override at the RAM floor, so that I cannot start a Preview that will take the host down.
83. As the Operator, I want a running Preview not to idle out, so that a URL I shared yesterday still works.
84. As the Operator, I want a Stop on Feature chrome (no confirm) to `compose down` without touching the Turn, worktree, record, branch, or named volumes, so that I can free a slot without aborting.
85. As the Operator, I want later ups (after stop, reboot, refused admission, or a dead stack) to be the Feature-chrome button and still pass the count-plus-RAM door, so that auto-start happens once and stop sticks.
86. As the Operator, I want Freigabe and abort to remove the Preview including named volumes, so that Feature-local data dies with the Feature.
87. As the Operator, I want a running Preview to rebuild on an implement Ticket commit and on the Feature-chrome button (including mid-Turn), so that I can see the new stand without waiting for close in the button case, and automatically after a snapshot.
88. As the Operator, I want Ticket close to be the commit — the rebuild starts after and cannot fail the close — so that closed-in-implement is a Platform fact, not a Docker outcome.
89. As the Operator, I want a stopped Preview not to be started by a Ticket close, so that stop still sticks.
90. As the Operator, I want a worktree that no longer meets the contract to leave the stack up, show the break, and refuse rebuild until the contract holds again, with Stop still available, so that I keep the last good URL.
91. As the Operator, I want a failed rebuild to leave the last good stand reachable, so that a bad Ticket does not take the Preview off the network.
92. As the Operator, I want rebuild not to pass the count-or-RAM door, so that an already-running Preview can update without re-applying for a slot.
93. As the Operator, I want overlapping rebuilds to coalesce to one trailing rebuild against the worktree afterwards, and Stop to clear that flag, so that I do not queue a stampede.
94. As the Operator, I want each Preview, TEST, and PROD stack to be a Compose project named from identity (`ab-<project-slug>-dev-<feature-slug>`, `ab-<project-slug>-test`, `ab-<project-slug>-prod`) via `-p`, so that a reboot reattaches the same named volumes.
95. As the Operator, I want no iframe, git-diff panel, environment dashboard, or API console, so that the first cut stays stage-led and Previews feel like the real origin.
96. As the Operator, I want TEST to be one standing Compose project per Project, created when the Project is added if `main` can run, following `main`, so that every merged Feature sits on the integration stand together.
97. As the Operator, I want DEV to hold only Previews and no standing stack of the default branch, so that without an open Feature DEV is empty.
98. As the Operator, I want to see TEST status and one link per public HTTP service on the Project, so that I can open the integration stand.
99. As the Operator, I want Freigabe DEV→TEST only after implement is closed, so that I cannot merge a Feature still in grill or tickets.
100. As the Operator, I want Freigabe DEV→TEST to merge the Feature into `origin/main` without a PR and to delete the Preview, worktree, and Feature branch, so that my yes is the merge.
101. As the Operator, I want the Feature record to remain after that Freigabe with the name still taken and no replay, so that I can see what shipped and cannot reopen a tree that is gone.
102. As the Operator, I want Freigabe TEST→PROD to be allowed anytime on the Project, so that I promote the integration stand when I am ready, not when a Feature closes.
103. As the Operator, I want Freigabe TEST→PROD to fast-forward `release` to the `main` commit TEST is on, or fail if that is not a fast-forward, and to create `release` if needed, so that PROD is that stand, not one Feature.
104. As the Operator, I want PROD to appear as one standing Compose project from the first Freigabe TEST→PROD, so that I do not run production before I have said yes.
105. As the Operator, I want each public HTTP service of TEST at `https://<service>--<project-slug>.test.glombik26.de` and of PROD under `*.prod.glombik26.de`, with the same slug and 63-character rules as Preview, so that Environments do not lie about who they are.
106. As the Operator, I want TEST and PROD URLs to have no Platform HTTP gate, so that I can share a link and so Project callbacks still work.
107. As the Operator, I want HTTPS on TEST and PROD via two Traefik ACME DNS-01 wildcards in the same `acme.json`, so that those zones match Preview's TLS story.
108. As the Operator, I want the Platform to fetch every Project's clone every 60 seconds and Apply when a Tracking Ref SHA changes (including force-push and rewind), so that TEST and PROD follow the branch without a webhook.
109. As the Operator, I want Freigabe and „jetzt ziehen“ to Apply immediately, so that I do not wait for the next tick after I said yes.
110. As the Operator, I want a missing Tracking Ref to be a visible break, not a stand to keep, so that I notice a deleted `main` or `release`.
111. As the Operator, I want a failed Apply to leave the last good stand up and show Bruch plus one error line on the Project (not logs), so that a bad SHA does not take TEST or PROD off the network.
112. As the Operator, I want poll not to re-Apply the same SHA after a failure — only „jetzt ziehen“ or a new SHA — so that a broken compose is not a tight loop.
113. As the Operator, I want Apply to be one-at-a-time per Environment and to coalesce to the latest SHA, so that a burst of pushes becomes one rebuild.
114. As the Operator, I want Apply to inspect the compose contract at the target SHA on the bare clone first; a miss leaves the worktree untouched and the last good stand up, so that a SHA without a contract does not erase running files.
115. As the Operator, I want a hit to `reset --hard` (or add the Environment worktree on first Apply) then `compose up --build` with the same edge injection as a Preview, no `down`, so that Docker's image cache and the last good stand stay.
116. As the Operator, I want named volumes to persist across Apply, including rewind, and to die only with the Project, so that TEST data outlives a commit.
117. As the Operator, I want TEST and PROD each to have their own Platform-owned detached worktree on the Project clone, so that they never share a Feature tree or each other.
118. As the Operator, I want a VPS reboot to keep records, clones, worktrees, session files, Environment Secrets, and File Secret trees, and not to revive Harness or Preview processes, so that I resume objects, not ghosts.
119. As the Operator, I want reboot to Apply TEST and PROD onto their Tracking Refs again, so that standing Environments come back.
120. As the Operator, I want three Environment Secret dotenv sets per Project (DEV shared by all Previews; TEST and PROD each their own), visible and editable on the Project page, so that Preview does not inherit TEST's outbound identity and only PROD sees production interfaces.
121. As the Operator, I want clearing an Environment Secret field to delete that store file, and a missing file not to block Preview or Apply, so that a Feature without keys still gets a stack.
122. As the Operator, I want a present store file copied onto `.env` in the Feature or Environment worktree before every `up` (overwrite), and an absent store to leave the worktree `.env` alone, so that a Harness-written `.env` is not smashed by an empty store.
123. As the Operator, I want three File Secret trees per Project (DEV shared by all Previews; TEST and PROD each their own), so that PEMs and service-account JSON can be bind-mounted as files.
124. As the Operator, I want to upload, replace, download, and delete a File Secret by relative destination path on the Project page, so that I can see what will land in the worktree.
125. As the Operator, I want deleting the last File Secret to remove the tree (missing again), and a missing tree not to block Preview or Apply, so that secrets stay optional.
126. As the Operator, I want each present store path copied into the worktree before every `up` (overwrite, even if tracked) and worktree files whose path left the store deleted, so that the tree matches the store; other worktree files stay.
127. As the Operator, I want destinations that are absolute, contain `..`, are `.env` / `.env.*`, are the root Compose file, or sit under `.git/` to be refused, so that File Secrets cannot hijack the contract or Git.
128. As the Operator, I want the Harness never to write Environment Secret or File Secret stores, so that one Feature cannot mutate the Project's DEV identity.
129. As the Operator, I want Preview, TEST, and PROD stacks to have no Platform HTTP gate and no host-published ports, so that Traefik is the only public ingress and databases stay on the project network.
130. As the Operator, I want this spec to be unbound by backlog-pilot conventions, and I want that host (`87.106.34.240`) left alone, so that the empty VPS (`185.56.150.49`) is the only machine this Platform owns.

## Implementation Decisions

- One deep module: the Platform. Its interface is the Operator acts (add/remove Project, create/abort Feature, send/cancel Turn, close/reopen Stage, pick/close Ticket, stop/start/rebuild Preview, Freigabe DEV→TEST, Freigabe TEST→PROD, „jetzt ziehen“, save Environment Secrets, upload/replace/delete File Secrets, complete Device-code). The web UI is a thin adapter over that interface, not a second module callers must learn. (ADR 0005, ADR 0009)
- Records for Projects, Features (stage machine, Slot session identities, closed-in-implement Ticket facts, per-Project PAT) live as files under a Platform home on the VPS, next to clones, not in this repo and not inside worktrees. Records are source of truth for those objects; disk (clone, worktree, `.scratch/`, `~/.grok/sessions`) is source of truth for content. Clone path, worktree path, Feature branch `feature/<name>`, and Compose project names are derived from identity, not stored. (ADR 0001, ADR 0004, ADR 0024)
- A Project carries its own fine-grained PAT when private; the Platform has none. Public Projects clone with no credential. Identity is GitHub `owner/name`. The Project exists after clone of the default branch. (ADR 0003)
- A Feature is a Platform object. Git and disk only carry it: one local branch from the Project default at creation, one worktree of the single clone. Abort deletes that worktree and branch. No remote branch during development, no stack onto another Feature, no second clone. (ADR 0001)
- The Operator closes every Stage; the Platform never auto-advances. A closed Stage can be reopened until the next Stage starts, then it is locked. grill-with-docs and to-spec share one Slot; to-tickets has its own; implement has one Slot per Ticket, at most one live. Handoffs are `.scratch/spec.md` and `.scratch/issues/` in the Feature worktree. implement closes only when every Ticket is closed-in-implement and the tree is clean. (ADR 0002)
- The Platform is the only ACP client. It spawns `grok agent stdio` per Slot (`cwd` = Feature worktree, always-approve), lives for one Turn, attaches a live Slot, and exposes Platform events (not raw ACP) to the UI. History is `session/load` replay. HITL is next prompt after `stopReason`, plus cancel. Subscription login is a Platform Device-code ceremony; token stays in `~/.grok/auth.json`. (ADR 0005)
- Stage kickoff is a prefilled skill slash the Operator sends. Later Turns are an empty box. Every `session/new` carries the same thin English `_meta.rules`. Adapted copies of the four Stage skills live once under the Platform user so `/implement` is the Platform Ticket skill. (ADR 0014)
- Closing a Ticket stages every non-ignored change and commits as a Platform identity with the Ticket name, or writes no commit if there is no diff. Reopen stacks another commit. `.scratch/` and the closed secret-path list (plus DEV File-Secret destinations) are kept off the branch via the Project `.gitignore`. Already-tracked files are left alone. No push, no PR. (ADR 0010, ADR 0020, ADR 0026)
- Previews and Environments are Compose projects on one Docker engine. One Platform-owned Traefik owns 80/443 (`exposedbydefault=false`). The Platform talks to Compose directly. (ADR 0006)
- One root Compose file is the contract. The Platform starts it with explicit `-f` and `-p`, injects edge labels, the proxy network, and `ENVIRONMENT=`, and `!reset`s host ports. Public HTTP services are marked `app-builder.public=true`. `container_name`, `network_mode: host`, and absolute host bind mounts fail the contract. A Feature exists without a Preview. (ADR 0008)
- Preview hostnames live under `*.dev.glombik26.de` as one DNS label `<service>--<feature>--<project-slug>`. TEST uses `*.test.glombik26.de` as `<service>--<project-slug>`; PROD the same under `*.prod.glombik26.de`. Wildcard A-records point at `185.56.150.49`. Traefik ACME DNS-01 via IONOS issues the three wildcards plus `platform.glombik26.de` into one `acme.json`. Overlong labels become a short Platform id; slug collisions are refused at create. (ADR 0012, ADR 0017, ADR 0019)
- Preview, TEST, and PROD URLs have no Platform HTTP gate. The Control Plane does (Traefik Basic Auth, one secret). (ADR 0019, ADR 0021, ADR 0023)
- Preview admission is platform-wide running count N (file under home, default 4, integer ≥ 1) plus a 2 GiB `MemAvailable` floor. The Platform refuses; it never evicts. TEST and PROD sit outside N. Home shows `k/N`. First-cut UI does not edit N. (ADR 0013)
- Auto-start fires once when the worktree first meets the contract. A Preview dies on Freigabe DEV→TEST, abort, reboot, or Operator Stop. Later ups are the Feature-chrome button and still pass admission. Stop leaves named volumes; Freigabe and abort remove them. No idle timeout. (ADR 0015)
- A running Preview rebuilds on Ticket commit and on the chrome button. Broken contract leaves the stack up and refuses rebuild. Failed rebuild leaves the last good stand. Close does not wait for Docker. Rebuild does not pass admission. Overlapping requests coalesce to one trailing rebuild; Stop clears the flag. (ADR 0018)
- DEV holds only Previews. TEST follows `main` as one standing stack from Project add (when `main` can run). PROD follows `release` from the first Freigabe TEST→PROD. Freigabe DEV→TEST (implement closed) merges onto `origin/main` without a PR and deletes Preview, worktree, and Feature branch; the record remains and the name stays taken. Freigabe TEST→PROD fast-forwards `release` to the `main` commit TEST is on, or fails. (ADR 0007)
- TEST and PROD each have a detached worktree. Apply (poll 60s, Freigabe, „jetzt ziehen“, reboot) is contract-at-bare-clone, then reset --hard (or worktree add), then `compose up --build`. A miss or a failed up leaves the last good stand. Movement is any SHA change after fetch; a missing ref is a visible break. Apply is one-at-a-time per Environment and coalesces to the latest SHA. Poll does not retry the same SHA after failure. Named volumes persist across Apply and die with the Project. (ADR 0016, ADR 0022)
- Compose project names are derived and always passed as `-p`: `ab-<project-slug>-dev-<feature-slug>`, `ab-<project-slug>-test`, `ab-<project-slug>-prod`. (ADR 0024)
- Environment Secrets are three dotenv files under Platform-home (mode like the PAT). File Secrets are three directory trees. DEV is shared by all Previews of that Project. Before every `up`, present dotenv is copied to worktree `.env`; present file-secret paths are copied to relative destinations and removed paths are deleted from the worktree. Missing stores are not a gate. The Harness does not write the stores. Project remove deletes PAT, dotenv files, and trees. (ADR 0025, ADR 0026)
- The Platform is a greenfield successor. It does not inherit backlog-pilot's object model, Preview naming, Nginx edge, or registry. That host stays that host's PROD. (ADR 0011)
- Implementation is staged. First cut: Platform records, Project add/remove, Feature create/abort, Guided Workflow + Harness wrapper + kickoff, implement Ticket close + local commits, Preview contract + Traefik + admission + stop/start + rebuild, stage-led UI at `platform.glombik26.de` behind Basic Auth. Later slices of this same spec: TEST/PROD Apply and poll, both Freigabe gates, Environment Secrets, File Secrets. Do not invent a fourth Environment, vanity domains, or a Platform HTTP gate on Preview/TEST/PROD to "finish" the first cut.

## Testing Decisions

- One seam: the Platform interface (the Operator acts above). Tests call that interface and assert external behaviour — what the Operator can see and what the next act is allowed to do. They do not assert ACP JSON-RPC framing, Compose CLI flags, Traefik file layout, or record-file shape. If a behaviour cannot be seen through an Operator act or its visible outcome (status, links, refusal reason, stage/ticket gates, last-good-stand vs Bruch, commit on the Feature branch, merge on `main`, fast-forward on `release`), it is not a test of this module.
- Adapters behind the Platform (Git, Compose, Harness ACP, clock, host memory) are injected so tests can fake them. Those adapters are not additional test seams for callers. One adapter today is a hypothetical seam; fakes in tests are the second adapter that makes the seam real.
- A good test is one Operator act (or a short sequence) and an observable outcome: Project appears only after clone succeeds; Feature name stays taken after Freigabe and is free after abort; a Stage cannot reopen once the next has started; implement close refuses a dirty tree; Ticket close is a commit or a no-op, never a rewind; Preview auto-starts once on first contract, later only by button; admission refuses at N or the RAM floor and never evicts; Stop leaves volumes, abort/Freigabe remove them; rebuild on commit does not start a stopped Preview and cannot fail close; broken contract leaves the stack up; Apply inspects the contract before reset; failed Apply keeps the last good stand; missing secrets are not a gate; Device-code blocks Harness acts, not the Project list; Control-Plane Basic Auth is not injected onto Preview/TEST/PROD hostnames.
- Persistence tests construct a Platform on a home, perform acts, construct a second Platform on the same home, and see the same objects. They do not expect Harness or Preview processes to revive.
- First-cut tests cover Projects, Features, Stages/Slots/Turns, Ticket close, and Preview lifecycle including admission. TEST/PROD/Freigabe/secrets tests land with those slices.
- Prior art: none in this repo (greenfield). Do not import backlog-pilot tests or fixtures.

## Out of Scope

- Multi-user, team accounts, multi-tenant, a second Operator identity
- Sources other than GitHub
- Billing
- The prod host `87.106.34.240` (backlog-pilot and running apps) — do not cut over, migrate, or shut it down
- PRE-PROD / hotfix path (fourth Environment)
- Custom / vanity domains for TEST and PROD
- Backup of Platform-home plus `~/.grok`
- Observability of the VPS (Compose logs, host metrics) — Bruch is one error line
- iframe Preview, git-diff panel, environment dashboard, API console, Feature inbox, replay after Freigabe
- Platform HTTP gate on Preview, TEST, or PROD
- Pushing the Feature branch, opening a PR, or publishing Tickets as GitHub issues on the Project
- `XAI_API_KEY` as the Operator subscription
- Coolify/Dokploy/Caddy/Nginx as the Preview substrate
- First-cut UI that edits N
- Content scanning for secrets; unstaging or `git rm --cached` of already-tracked files
- Idle timeout or eviction of Previews
- This map implementing the running Platform (the spec is the handoff)

## Further Notes

- Domain terms are those in `CONTEXT.md`. Do not substitute user/admin for Operator, app/repo for Project, ticket/branch/PR for Feature, deploy/sync for Apply, approval/merge for Freigabe, or environment for Preview.
- Locked decisions live in `docs/adr/`. This spec must not silently reopen them. If implementation discovers a contradiction, stop and record a new ADR; do not "just fix it" in code.
- Source map: [Weg zur Spec der App-Builder-Plattform](https://github.com/glombik26/app-builder/issues/1). Child grilling and research issues #2–#30 are closed; their resolutions are the ADRs.
- Operator-facing issue titles stay German; glossary and this spec stay English so agents and ADRs share one language.
