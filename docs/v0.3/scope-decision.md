# v0.3 Scope Decision — Project Brain Foundation

## Decision

**GO — the Project Brain Foundation is the v0.3 scope.**

This is a definite decision, not a recommendation to decide later. The evidence
is in [current-gap-analysis.md](current-gap-analysis.md) (the product is
stateless over time, confirmed against source) and
[option-evaluation.md](option-evaluation.md) (Project Brain scored highest — 46 —
and every alternative is either strategically inert or blocked on the very
foundation the Project Brain provides).

A GO decision must carry eight specifics. All eight are fixed below.

## 1. One North Star

> OH MY PM can capture a project observation locally, preserve minimized
> evidence, compare it with the previous observation, and return deterministic
> changes — without modifying the project or uploading its content.

## 2. One minimal vertical slice

Analyze → **capture** → store minimized snapshot outside the project → change the
project → **capture** → **report deterministic changes** vs. the previous
snapshot → inspect evidence → **export/delete**. Offline, deterministic, no
project write, no upload, no secrets.

## 3. One persistence decision

State lives in the OH MY PM **application-data directory** (data-location variant
of the existing config-resolution precedent), never in the project. The evaluated
default format is **append-oriented JSON/JSONL behind an explicit persistence
interface**, chosen to preserve the "Node 20+, zero native dependencies,
reproducible archives" guarantees; the format is finalized in Phase 2 against the
recorded evaluation, and **no dependency is added during discovery**. A SQLite
adapter may be added behind the same interface later, as a separate decision, if a
real query need is proven.

## 4. One package-placement decision

The persistence **interface** is a pure contract consumed by the runtime; the
**single Node adapter module** is the sole application-state writer — the state-
layer analogue of the existing single read-only document boundary and single
installer write adapter. **No new package** is created unless Phase 2 proves the
boundary needs one for dependency hygiene; the budget permits at most one, spent
only if audit-proven, never for symmetry.

## 5. One interface budget (binding)

| Surface | Budget |
|---|---|
| new CLI commands | **≤ 6**, under one `memory` namespace |
| new MCP tools | **≤ 1** (first release may ship **0**); **0** write tools, ever, in the first release |
| new public contracts | **≤ 6** (ProjectIdentity, EvidenceRecord, ProjectState, ProjectSnapshot, ChangeSet, Freshness) |
| new packages | **≤ 1** (only if audit-proven in Phase 2) |

## 6. One phased plan

Phase 0 contracts+guards → Phase 1 kernel diff/match/freshness → Phase 2
persistence adapter → Phase 3 runtime capture/compare → Phase 4 CLI `memory`
surface → Phase 5 one read-only MCP projection → Phase 6 release qualification.
Each phase is independently testable with its own acceptance gates (see
[implementation-plan.md](implementation-plan.md) and
[acceptance-gates.md](acceptance-gates.md)).

## 7. One explicit non-scope

Out of scope for v0.3, each requiring a separate later decision: cloud sync,
remote database, accounts, telemetry, vector/embedding/graph databases, daemons,
event buses, queues, multi-agent schemes, autonomous write-back, project-file
modification, a mandatory LLM, a provider marketplace, new external providers, a
large MCP tool expansion, a dashboard, a mobile app, real-time collaboration, and
bidirectional third-party sync. The MCP write tool is prohibited in the first
release outright.

## 8. One first implementation phase

**Phase 0 only** — the six contracts and the boundary guards, with no persistence
and no behavior change — and only after a separate, explicit approval to begin
implementation. Nothing beyond Phase 0 is authorized by this decision.

## What this decision does not do

It changes no source, no `version.json` (stays `0.2.0`), no release workflow, and
opens no `0.3.0-alpha.0`. It is a planning decision recorded as documentation. The
`v0.2.x` line stays maintenance-only until a v0.3 implementation line is
separately and explicitly opened.

## Deferred directions and their sequence

- **MCP intelligence** (`project_changes`, `project_decisions`, `project_health`,
  `project_readiness`) — added as read-only projections **over** the Project
  Brain, after it exists.
- **Distribution/UX** (L1 `--help`, L2 installed MCP config) — handled as low-risk
  maintenance or folded into v0.3's own CLI/MCP surface.
- **More integrations** (ClickUp, Airtable, Jira, Linear, GitHub Projects) — added
  last, once a provider-independent state model absorbs each new source without
  reshaping the core.

Each deferred step is cheaper and safer specifically because the Project Brain is
built first.
