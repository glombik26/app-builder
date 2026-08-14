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
A GitHub repository the Platform has checked out and can develop Features against.
_Avoid_: app, repo (as a domain term), codebase

**Feature**:
A platform-owned unit of work on a Project that follows the guided workflow and owns a Preview while in development. A Git branch, worktree, or directory may carry it; none of those is the Feature.
_Avoid_: ticket, branch, PR, change (as the name of this unit)

**Guided Workflow**:
The fixed sequence of stages for a Feature: grill-with-docs → to-spec → to-tickets → implement.
_Avoid_: pipeline, CI, process

**Stage**:
One step of the Guided Workflow. The four Stages are grill-with-docs, to-spec, to-tickets, and implement.
_Avoid_: step, phase, job

**Harness**:
The grok-build process the Platform wraps to drive a Feature's Guided Workflow.
_Avoid_: agent, LLM, chatbot (as the name of this process)

**Preview**:
An isolated Docker stack with its own reachable URL for exactly one Feature on DEV.
_Avoid_: staging, sandbox, environment (as a synonym for this stack)

**Environment**:
A long-lived deployment target. The three Environments are DEV, TEST, and PROD.
_Avoid_: stage, server, instance

**Freigabe**:
The Operator's explicit yes that moves a Feature from DEV to TEST, or from TEST to a Release on PROD.
_Avoid_: approval, accept, merge, deploy (as the name of this decision)

**Release**:
The artifact that may be deployed to PROD after Freigabe on TEST.
_Avoid_: version, build, tag (as the name of this artifact)
