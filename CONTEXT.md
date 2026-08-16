# App-Builder

The Platform: a single-Operator control plane for developing software through a guided grok-build workflow, with per-Feature Previews and a DEV → TEST → PROD promotion path.

## Language

**Platform**:
This repo (`app-builder`). The control plane the Operator uses to create Projects, run the guided workflow, and promote Features.
_Avoid_: app, product, system, tenant

**Operator**:
The single human who runs the Platform. There is exactly one.
_Avoid_: user, admin, customer, team

**Project**:
A GitHub repository identified by its GitHub `owner/name`. The Platform has checked it out as exactly one clone and can develop Features against it. Access to a private Project belongs to that Project, not to the Platform.
_Avoid_: app, repo (as a domain term), codebase

**Feature**:
A platform-owned unit of work on a Project, identified by an operator-given name that is unique within that Project and does not change. It follows the guided workflow and owns a Preview while in development. After Freigabe DEV→TEST the Preview, worktree, and Feature branch are gone; the record remains and the name stays taken. A Git branch, worktree, or directory may carry it; none of those is the Feature.
_Avoid_: ticket, branch, PR, change (as the name of this unit)

**Guided Workflow**:
The fixed sequence of stages for a Feature: grill-with-docs → to-spec → to-tickets → implement. Handoffs live in the Feature worktree (`.scratch/`), not as issues on the Project.
_Avoid_: pipeline, CI, process

**Stage**:
One step of the Guided Workflow. The four Stages are grill-with-docs, to-spec, to-tickets, and implement. The Operator closes a Stage; the Harness may propose done, the Platform never advances on its own. A closed Stage can be reopened until the next Stage starts; after that it is locked. The only way back past a started later Stage is aborting the Feature. implement is a shell: it contains Tickets, it is not itself one Ticket session.
_Avoid_: step, phase, job

**Ticket**:
A vertical slice of a Feature, produced by to-tickets and stored in the Feature worktree. Distinct from the Feature and from a Stage. Closed-in-implement is a fact the Platform holds about the Ticket, not something the file records.
_Avoid_: slice, work item, issue (as the name of this unit)

**Harness**:
The grok-build process the Platform wraps to drive a Feature's Guided Workflow. The Platform is the only client; the Operator-facing UI does not speak to grok-build. grill-with-docs and to-spec share one Harness session; to-tickets has its own; implement has one session per Ticket.
_Avoid_: agent, LLM, chatbot (as the name of this process)

**Slot**:
A Feature's pointer to one Harness conversation: grill-with-docs and to-spec share one; to-tickets has one; each implement Ticket has one. The Feature record holds the last session identity per Slot.
_Avoid_: session (as the name of this pointer — a session is the Harness conversation)

**Turn**:
One Operator prompt on a Slot until the Harness reports the turn has ended. The live Harness process exists only for that Turn.
_Avoid_: request, call, message, exchange

**Preview**:
An isolated Docker stack with its own reachable URL for exactly one Feature on DEV.
_Avoid_: staging, sandbox, environment (as a synonym for this stack)

**Environment**:
A long-lived place a Project can run. The three Environments are DEV, TEST, and PROD.
_Avoid_: stage, server, instance

**DEV**:
The Environment that holds Previews. It has no standing stack of the Project's default branch; without an open Feature, DEV is empty.
_Avoid_: a third running copy of main

**TEST**:
The Environment that runs the Project's `main` branch as one standing stack, from the moment the Project exists and `main` can run. It is the integration stand: every Feature merged into `main` is on TEST together.
_Avoid_: a single Feature candidate, staging-as-one-preview

**PROD**:
The Environment that runs the Project's long-lived `release` branch as one standing stack. One stack per Project. It exists from the first Freigabe TEST→PROD; that Freigabe creates `release` if needed.
_Avoid_: a second TEST, blue/green as a second Environment

**Freigabe**:
The Operator's explicit yes at two gates. DEV→TEST is allowed only after implement is closed: the Platform merges the Feature into `main` (no PR) and deletes Preview, worktree, and Feature branch. TEST→PROD is allowed anytime: the Platform fast-forwards `release` to the `main` commit TEST is on, or fails if that is not a fast-forward; it promotes the whole integration stand, not one Feature. Each Environment follows its branch — a new commit on the ref rebuilds the stack.
_Avoid_: approval, accept, merge, deploy (as the name of this decision)

**Release**:
The commit PROD runs — the tip of the Project's `release` branch after Freigabe on TEST. A Git tag may label it; the tag is not the Release.
_Avoid_: version, build, tag (as the name of this artifact)
