# v0.3 Phase 0 — Project Brain Contracts (implemented)

> **Status: Phase 0 implemented and green.** Phase 1 (the pure deterministic
> Kernel) is implemented; see [phase-1-kernel.md](phase-1-kernel.md). Phase 2 is
> not started. Source version remains `0.2.0`. No persistence, no
> application-state write, no project write, no network path, no new MCP tool, and
> no product behavior change was introduced. The Project Brain **product** is
> **not** user-accessible — only its contract data boundary (Phase 0) and pure
> Kernel logic (Phase 1). Implementation of Phase 2+ requires a separate, explicit
> approval.

This document records the implemented surface of v0.3 Phase 0: the six versioned
Project Brain contract families, their deterministic cross-language generation,
the contract tests, and the architecture guards that hold the Phase 0 boundary.
It is authoritative for what Phase 0 did and, equally, for what it deliberately
did not do.

## Implemented scope

Phase 0 defines **contracts only**, following the approved
[data model](data-model.md), [security/privacy](security-privacy.md), and
[implementation plan](implementation-plan.md) (Phase 0). The single new contract
domain `projectbrain` is generated deterministically into TypeScript and Rust
from the canonical `contracts/schema/*.schema.json` system, exactly like every
existing domain.

Explicitly **not** implemented in Phase 0 (each deferred to a later, separately
approved phase): persistence, application-state writes, project-file writes,
snapshot capture behavior, change/diff computation, freshness calculation,
runtime orchestration, CLI `memory` commands, MCP changes or new tools, new
providers, a version bump, and any release preparation.

## The six primary contracts

All six are strongly typed structs, each carrying an explicit `schemaVersion`
field, and are exported through `@oh-my-pm/contracts` (TypeScript) and the
`oh_my_pm_kernel::contracts::projectbrain` module (Rust).

| Contract | Role |
|---|---|
| `ProjectIdentity` | Deterministic, network-free identity for a project across runs. |
| `EvidenceRecord` | A minimized, sanitized record of one observed source item. |
| `ProjectState` | The canonical, provider-independent derived state at one observation. |
| `ProjectSnapshot` | An immutable capture: identity + state + evidence refs + boundaries + fingerprint. |
| `ChangeSet` | The deterministic diff between two snapshots. |
| `Freshness` | The separated freshness/coverage model referenced by state. |

## Supporting declarations (interface budget respected)

The public **contract families** remain exactly the six above. To make those six
strongly typed (and avoid `JsonValue` where a small stable structure is clearly
justified), Phase 0 adds a minimal set of supporting enums, one constant, and
four small helper structs. They are listed here explicitly.

**Constant**

- `PROJECT_BRAIN_SCHEMA_VERSION = 1` — the initial Project Brain schema version,
  emitted as a TS `const` and a Rust `fn project_brain_schema_version() -> i64`.

**Enums** (all values camelCase per the generator)

- `ProjectIdentityKind` — `explicit` | `derived`
- `EvidenceSourceKind` — `markdown` | `githubIssue` | `githubPullRequest` |
  `githubRepository` | `structured` | `generic`
- `RawContentPolicy` — `notStored` | `minimized` | `storedOptIn`
- `RetentionState` — `active` | `superseded` | `pendingDelete`
- `FreshnessStatus` — `known` | `unknown`
- `StateItemKind` — `milestone` | `task` | `risk` | `decision` | `dependency` | `blocker`
- `CoverageState` — `complete` | `partial` | `skipped`
- `ChangeCategory` — `added` | `removed` | `modified` | `resolved` | `reopened` |
  `becameOverdue` | `noLongerOverdue` | `severityIncreased` | `severityDecreased` |
  `fresh` | `stale` | `evidenceChanged`

**Helper structs** (small, typed, cross-language)

- `FreshnessDimension` — one separately tracked freshness dimension (`status`,
  optional `ageSeconds`, optional `referenceTimestamp`); lets a dimension be
  explicitly `unknown` without guessing a timestamp.
- `CanonicalStateItem` — a generic, provider-independent state item (kind, stable
  id, title, item-level evidence refs, optional status/severity/owner/dueDate/
  priority/metadata). Prevents prose-only state.
- `SourceDescriptor` — a sanitized descriptor of one observed source in a state.
- `SourceBoundary` — a snapshot boundary descriptor making partial observation
  explicit (source identity, included scope, coverage state, optional gap reason).
- `StateChange` — one deterministic change inside a `ChangeSet` (category, item
  kind, item id, evidence refs, optional structured previous/current values).

**Justification.** Each helper exists solely to keep a primary contract strongly
typed across TypeScript and Rust. No large taxonomy was introduced; there are no
speculative contracts and no dozens of helper types. `JsonValue` was deliberately
avoided for these stable shapes.

## Schema version

Phase 0 uses initial schema version **`1`**, expressed once as the generated
constant `PROJECT_BRAIN_SCHEMA_VERSION` and carried as a `schemaVersion` field on
all six primary contracts, in both generated languages. No migrations are defined
in Phase 0.

## Cross-language generation

- Schema source: `contracts/schema/projectbrain.schema.json` (one domain,
  lowercase name matching the file, following every existing generator
  convention: PascalCase declarations, camelCase fields, camelCase enum values,
  required documentation, deterministic ordering).
- Generated TypeScript: `contracts/generated/ts/projectbrain.ts`, exported via the
  barrel `contracts/generated/ts/index.ts` and re-exported by `@oh-my-pm/contracts`.
- Generated Rust: `contracts/generated/rust/projectbrain.rs`, exposed via the
  barrel `contracts/generated/rust/mod.rs`, which the Kernel crate already
  compiles through its existing `contracts` module.
- The canonical generator `tools/gen-contracts.mjs` was **not** modified; the new
  domain flows through the existing pipeline unchanged.
- Generation is deterministic: re-running the generator produces byte-identical
  output (verified), with the standard generated header, no timestamps, and no
  machine-local paths. TypeScript and Rust are semantically parallel with
  camelCase JSON on both sides.

## Contract test coverage

- `contracts/test/generator.test.ts` — extended: `projectbrain` added to the
  deterministic domain list; representative assertions for all six primary types
  in both TS and Rust; barrel export/exposure; schema-version constant; approved
  camelCase enum serialization; existing determinism/no-drift and
  no-timestamp/no-path checks unchanged and not weakened.
- `contracts/test/projectbrain.test.ts` — new focused suite: all six contracts
  are exported through `@oh-my-pm/contracts`; minimal fixtures for identity,
  minimized evidence, four-dimension freshness, evidence-referencing state, a
  snapshot embedding state + evidence ids, and a change set of exact categories;
  JSON stringify/parse round-trip; `schemaVersion === 1` across fixtures; and a
  privacy scan asserting no absolute paths, credentials, raw bodies, or
  authorization data appear in any fixture. Uses compile-time typing plus
  deterministic runtime assertions; **no** runtime schema-validation library was
  added.
- `kernel/crate/tests/projectbrain_contracts.rs` — new contract-only serde
  round-trip test proving the generated Rust module stays valid and its camelCase
  JSON matches the generated TypeScript. It lives under `tests/`, contains no
  product logic, touches no Kernel production module, and adds **no** dependency
  (uses the already-present `serde` / `serde_json`).

## Architecture guards

Existing validators were extended with the smallest maintainable change; no new
validation framework was created.

`tools/validate-structure.mjs`

- `projectbrain` added to the generated-domain list (auto-requires the TS and
  Rust modules and the barrels).
- A Phase 0 block asserts the schema domain exists, both generated modules exist,
  each of the six primary contracts exists in both languages and carries
  `schemaVersion`, the schema-version constant exists in both languages, and no
  forbidden field declaration (`absolutePath`, `token`, `authorization`, `bearer`,
  `body`) appears — matching field declarations only, never doc-comment prose.

`tools/validate-boundaries.mjs`

- Asserts the schema and both generated modules are tracked and the barrels export
  the domain.
- Asserts the projectbrain surface lives entirely under `contracts/**` (the only
  permitted exception is the single kernel serde round-trip test), rejecting
  premature Phase 1+ source such as capture/persistence modules.
- Rejects forbidden Phase 0 capability markers inside any projectbrain file
  (filesystem writes, network, database/persistence adapters, memory/snapshot
  stores).
- Rejects premature persistence source files anywhere (`memory-store`,
  `snapshot-store`, `persistence-adapter`), excluding documentation.
- Asserts the MCP server registers no projectbrain / memory / `project_changes`
  tool (the ten-tool set is untouched).
- Re-asserts the Phase 0 privacy invariants on the generated contracts (no
  absolute-path field on identity, no credential/body field on evidence).

Both guard sets were verified positively (green on the real tree) and negatively
(each fires when a violation is injected, then returns to green once reverted).

## Privacy decisions

- **Identity representation:** a hybrid opaque `id` with a `kind` of `explicit` or
  `derived`; a display-only, non-absolute `rootHint`. The contract stores no raw
  absolute path.
- **Absolute-path storage:** none. Enforced by contract shape and by the guards.
- **Evidence minimization:** the default `rawContentPolicy` is `minimized` — a
  `contentFingerprint` plus allow-listed provenance/metadata, not verbatim text.
- **Content-fingerprint optionality:** `contentFingerprint` is optional precisely
  so `notStored` evidence can omit it.
- **Raw-content policy:** `notStored` | `minimized` | `storedOptIn`; verbatim text
  is opt-in only. Credentials are never modeled; there is no token, authorization,
  bearer, raw-body, diff-hunk, or commit-identifier field anywhere.
- **Freshness dimensions:** four separate dimensions (observation, source,
  evidence, derived-state), never collapsed into one score and never a learned or
  probabilistic value; `unknown` is representable without a guessed timestamp.
- **Canonical state items:** a single generic `CanonicalStateItem` expresses all
  six item kinds with title-level fields and evidence refs — no raw content, no
  prose-only state.
- **Source boundaries:** `SourceBoundary` makes partial observation explicit
  (coverage state + optional gap reason).
- **Change categories:** exact/normalized categories only; no fuzzy score,
  confidence probability, LLM explanation, or raw body on a change.
- **Injected time:** every timestamp field (`observedAt`, `capturedAt`,
  `comparedAt`, `referenceTimestamp`) is caller-provided data; no clock access is
  implied or implemented.

## Generator constraint resolutions

The generator requires enum values to be **camelCase**, while the discovery
documents wrote several source/policy/category values in kebab-case (e.g.
`github-issue`, `not-stored`, `became-overdue`). Resolution: the camelCase
serialization is the smallest clear representation that preserves the approved
meaning, so the wire values are `githubIssue`, `notStored`, `becameOverdue`, and
so on. This is a naming-form choice only; the product model (the taxonomy,
policies, and change categories) is unchanged. `RetentionState.pendingDelete`,
`RawContentPolicy.storedOptIn`, and the `severityIncreased`/`severityDecreased`/
`noLongerOverdue`/`evidenceChanged` change categories follow the same rule.

## Files changed

- `contracts/schema/projectbrain.schema.json` (new)
- `contracts/generated/ts/projectbrain.ts` (generated, new)
- `contracts/generated/rust/projectbrain.rs` (generated, new)
- `contracts/generated/ts/index.ts` (generated barrel, `projectbrain` added)
- `contracts/generated/rust/mod.rs` (generated barrel, `projectbrain` added)
- `contracts/test/generator.test.ts` (extended)
- `contracts/test/projectbrain.test.ts` (new)
- `kernel/crate/tests/projectbrain_contracts.rs` (new, contract-only serde test)
- `tools/validate-structure.mjs` (Phase 0 guards)
- `tools/validate-boundaries.mjs` (Phase 0 guards)
- `docs/v0.3/phase-0-contracts.md` (this document)
- `docs/v0.3/README.md`, `docs/v0.3/implementation-plan.md`, `docs/roadmap.md`
  (narrow status updates)

`version.json`, all package versions, lockfiles, the release workflows, and every
Runtime / Planner / Skills / Providers / CLI / Installer / MCP / Kernel production
source file are unchanged.

## Acceptance result

Phase 0 exit criteria (gate G14 plus generation determinism) are met:

- the six contract families exist and are strongly typed in both languages;
- generation is deterministic (byte-identical on repeat);
- TypeScript and Rust agree semantically (serde round-trip proven);
- contract fixtures round-trip through JSON;
- validators enforce the Phase 0 boundaries (verified positively and negatively);
- no runtime dependency was added;
- no product behavior changed;
- `version.json` stays `0.2.0`;
- the MCP surface stays exactly ten tools in its existing order;
- the existing v0.2 suite stays green.

## Explicit non-implementation of Phases 1–6

Phase 0 implements **no** behavior. The following remain unimplemented and require
separate, explicit approval, in order: Phase 1 (deterministic kernel
normalization, identifiers, fingerprint computation, change classification,
freshness rules), Phase 2 (local persistence adapter), Phase 3 (runtime
capture/compare), Phase 4 (CLI `memory` surface), Phase 5 (one read-only MCP
projection), Phase 6 (release qualification). No fingerprint, diff, matching, or
freshness function is implemented in Phase 0; the fingerprint fields are string
placeholders in the contract only.
