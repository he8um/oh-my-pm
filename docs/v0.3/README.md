# OH MY PM — v0.3 Project Brain Foundation

> **Status: Phases 0–6 implemented. Phase 7 (stable qualification and `0.3.0`
> preparation) — implemented.** Phase 0 (contracts and guards), Phase 1
> (deterministic Kernel), Phase 2 (local persistence adapter), Phase 3 (Runtime
> capture and compare), Phase 4 (preview-first CLI memory surface), Phase 4.1
> (snapshot capture chronology correction), Phase 5 (read-only MCP
> `project_changes`), and Phase 6 (installed-artifact release qualification and
> `0.3.0-rc.1` preparation) are all implemented.
> The `v0.3.0-rc.1` prerelease **is published** (a non-draft prerelease targeting
> `1db4057…`, not marked latest); it was validated from its public assets and
> received a GO decision, so Phase 7 promoted the source version to `0.3.0` and
> prepared the protected stable release workflow. The self-contained v0.3 release
> bundle ("project-brain" profile) ships the bundled `@oh-my-pm/project-memory`
> package, so the **installed** CLI memory commands and the **installed** MCP
> `project_changes` tool resolve without a workspace checkout: the installed MCP
> exposes eleven tools. The historical v0.2 bundle (no profile) still exposes ten
> tools; the published `v0.2.0` remains the latest stable and is unchanged.
> **`v0.3.0` is prepared but not yet published as stable — publication is a
> separate, explicitly authorized action, and no `v0.3.0` tag or stable release
> exists yet.** See
> [phase-6-release-qualification.md](phase-6-release-qualification.md),
> [phase-7-stable-qualification.md](phase-7-stable-qualification.md), the
> [RC release notes](../releases/v0.3.0-rc.1.md) and its
> [post-publication validation](../releases/v0.3.0-rc.1-post-publication-validation.md),
> the [stable release notes](../releases/v0.3.0.md), the
> [stable publishing guide](../releases/publishing-v0.3.0.md), and the
> [installed getting-started guide](getting-started-installed.md).
> Phase 0 added the six versioned Project Brain contracts, their deterministic
> TS/Rust generation, contract tests, and architecture guards. Phase 1 added the
> pure, deterministic Kernel module (normalization, identifiers, canonical
> serialization, fingerprints, freshness, and diff) with golden fixtures. Phase 2
> added the private `@oh-my-pm/project-memory` package and one explicit Node
> filesystem adapter (atomic writes, integrity, immutable records, safe reads,
> single-writer locking, a migration scaffold, export, and delete). Phase 3 wired
> them together into a provider-independent Runtime capture/compare API: read-only
> observation → pure Skills state/evidence derivation → Phase 1 Kernel
> finalization → one Phase 2 memory transaction → Phase 1 deterministic diff. It
> added the minimal Kernel WASM/TypeScript binding for the seven pure Phase 1
> functions, a pure Skills derivation module, and the orchestration under
> `runtime/src/projectbrain/**` — with an unchanged `Runtime.handle()`. Phase 4
> exposed that slice through the CLI as one new `memory` namespace with exactly
> six preview-first subcommands (`capture`, `changes`, `status`, `history`,
> `export`, `delete`), composing the Phase 3 Runtime and lazily constructing the
> Phase 2 adapter on the memory path only. Phase 5 then added the single
> read-only `project_changes` MCP tool, and Phase 6 packaged the slice into the
> self-contained "project-brain" release bundle (which now includes the built
> `@oh-my-pm/project-memory` package so the installed MCP exposes eleven tools).
> The source version was promoted to `0.3.0-rc.1` for the published prerelease and
> then to `0.3.0` in Phase 7 for the prepared (not yet published) stable release;
> the published `v0.2.0` stable is unchanged. See
> [phase-0-contracts.md](phase-0-contracts.md) for the contract surface,
> [phase-1-kernel.md](phase-1-kernel.md) for the Kernel,
> [phase-2-persistence.md](phase-2-persistence.md) for the adapter,
> [phase-3-runtime.md](phase-3-runtime.md) for the Runtime orchestration,
> [phase-4-cli.md](phase-4-cli.md) for the CLI memory surface,
> [phase-4-1-snapshot-chronology.md](phase-4-1-snapshot-chronology.md) for the
> snapshot capture chronology correction (internal store format 2; the default
> comparison and history now use real capture order), and
> [phase-5-mcp.md](phase-5-mcp.md) for the read-only `project_changes` MCP
> projection (eleven tools in the source/workspace capability server; ten in the
> legacy v0.2 bundle).

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
| 10 | [phase-0-contracts.md](phase-0-contracts.md) | The **implemented** Phase 0 contract surface: the six contracts, generation, tests, and guards. |
| 11 | [phase-1-kernel.md](phase-1-kernel.md) | The **implemented** Phase 1 pure Kernel: normalization, identifiers, fingerprints, freshness, diff, and golden fixtures. |
| 12 | [phase-2-persistence.md](phase-2-persistence.md) | The **implemented** Phase 2 local persistence adapter: format, layout, atomic commit, locking, integrity, migration, export, delete, and privacy. |
| 13 | [phase-3-runtime.md](phase-3-runtime.md) | The **implemented** Phase 3 Runtime capture/compare orchestration, the minimal Kernel binding, the pure Skills deriver, evidence minimization, and the below-CLI e2e slice. |
| 14 | [phase-4-cli.md](phase-4-cli.md) | The **implemented** Phase 4 preview-first `memory` CLI surface: command grammar, explicit identity, preview/apply, output modes, exit codes, privacy, and the source-workspace qualification. |
| 15 | [getting-started-memory.md](getting-started-memory.md) | A hands-on walkthrough of the `memory` commands from the source/workspace CLI (unreleased; not in published v0.2 artifacts). |

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
