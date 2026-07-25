# OH MY PM — v0.3 Project Brain Foundation

> **Status: discovery and architecture gate — complete.**
> **v0.3 implementation: not started.** No source, version, workflow, or release
> change is authorized by this document set. `version.json` remains `0.2.0` and
> `v0.2.x` stays maintenance-only (see
> [the v0.2.x maintenance policy](../releases/v0.2.x-maintenance-policy.md)).
> Implementation requires a separate, explicit approval, and only Phase 0 may
> begin when that approval is given.

## What this is

This directory records the v0.3 discovery: an evidence-based audit of the stable
`v0.2.0` product, a scored comparison of candidate next directions, and a
narrow, provider-independent architecture for the direction that scored highest —
a **local-first Project Brain** that makes OH MY PM stateful over time without
changing a single project file or uploading any project content.

It is planning only. It defines *what* v0.3 would build and *why*, the data model
and boundaries, the phases, and the gates that would let each phase ship. It does
not build any of it.

## The one-line decision

**GO — Project Brain Foundation is the selected v0.3 scope.**

OH MY PM can already read a local project (Markdown, and read-only GitHub) and
produce a deterministic brief, risk report, next-task list, or handoff. It cannot
remember anything between runs. Every observation is thrown away when the process
exits. The one missing foundation — the one that unblocks project-health,
project-change, decision-tracking, and every future intelligence surface — is a
deterministic, privacy-preserving, local record of what was observed and how it
changed.

## North Star

> OH MY PM can capture a project observation locally, preserve minimized
> evidence, compare it with the previous observation, and return deterministic
> changes — without modifying the project or uploading its content.

## Reading order

| # | Document | Purpose |
|---|---|---|
| 1 | [product-brief.md](product-brief.md) | Primary user, job-to-be-done, current pain, North Star, non-goals. |
| 2 | [current-gap-analysis.md](current-gap-analysis.md) | Evidence-based capability map of `v0.2.0` and the exact post-v0.2 gap. |
| 3 | [option-evaluation.md](option-evaluation.md) | Four candidate directions scored on eleven dimensions, with the decision rules. |
| 4 | [architecture.md](architecture.md) | Layer boundaries, package placement, and the capture/compare/persistence flows (with diagrams). |
| 5 | [data-model.md](data-model.md) | ProjectIdentity, EvidenceRecord, ProjectState, Snapshot, ChangeSet, and the freshness model. |
| 6 | [security-privacy.md](security-privacy.md) | The preserved trust model, the new local-state write boundary, and the threat model. |
| 7 | [implementation-plan.md](implementation-plan.md) | Independently testable Phases 0–6 with allowed files, deliverables, and stop conditions. |
| 8 | [acceptance-gates.md](acceptance-gates.md) | Hard gates G1–G14 with measurable evidence. |
| 9 | [scope-decision.md](scope-decision.md) | The formal GO decision and its required contents. |

## Invariants this plan will not cross

Every part of the design below preserves the v0.2 trust model without exception:

- no project-file writes;
- no project-content upload;
- no telemetry;
- network only through the existing explicit providers (GitHub stays GET-only);
- MCP stays stdio-only, and the existing ten tools stay backward compatible;
- local Markdown workflows stay fully offline;
- tokens stay environment-only.

The single new capability is an **application-state write boundary**: an explicit,
user-invoked write to an OH MY PM application-data location that is never inside
the analyzed project. Project writes remain prohibited; application-state writes
become explicit and user-controlled. The two are kept strictly distinct
throughout.

## Interface budget

v0.3 is deliberately small. The whole Project Brain foundation fits inside:

- **new CLI commands:** ≤ 6, under a single `memory` namespace;
- **new MCP tools:** ≤ 1 (and the first release may ship **zero**);
- **new public contracts:** ≤ 6 (ProjectIdentity, EvidenceRecord, ProjectState, Snapshot, ChangeSet, Freshness);
- **new packages:** ≤ 1 (a persistence adapter; a single new package only if the audit-proven boundary requires it).

See [scope-decision.md](scope-decision.md) for the binding budget and the first
implementation phase.
