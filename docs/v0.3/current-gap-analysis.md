# v0.3 Current-Capability Map and Gap Analysis

All classifications below are grounded in the `v0.2.0` source tree at baseline
commit `f194591`, not in documentation claims. Where a claim is load-bearing it
cites a file so it can be re-verified.

## 1. Current-capability map

Legend: **Complete** = stable and finished · **Narrow** = stable but
intentionally bounded · **Deferred** = designed but not a reachable feature ·
**Missing** = foundation absent.

| Area | State | Evidence and notes |
|---|---|---|
| **Kernel** (`kernel/crate`, WASM) | Complete | Pure Rust state machine, update guard, and JSON validation with real task-graph cycle detection; four WASM exports (`kernelVersion`, `validateJson`, `checkUpdatePlan`, `decideTransition`), all JSON-in/JSON-out and fail-closed. Dedicated `purity.rs`. No I/O of any kind. |
| **Contracts** (`contracts`) | Complete | JSON schema is the single source of truth; `tools/gen-contracts.mjs` emits **both** TS and Rust deterministically (no timestamps/paths, fixed ordering). Rust kernel includes generated Rust directly, so wire types are identical across languages. |
| **Providers** (`providers`) | Complete + Narrow | `local` (in-memory, read-only) and `github` (GET-only, single fixed origin, single page, bounded, no writes/GraphQL/cache/retry/sync). Network confined to one module (`github/transport.ts`). Contract enum lists seven provider ids but only `local`+`github` are registered — a forward-looking superset, not capability. |
| **Runtime** (`runtime`) | Complete | Pure request orchestrator; validates every request through the kernel, dispatches `status`/`doctor`/`plan`, discards raw provider data via a provenance allow-list. Holds **no** state between calls; `purity.test.ts`. |
| **Planner** (`planner`) | Complete | Pure intent classification, context extraction, provider-request planning, deterministic task graphs, missing-context responses. No I/O, no clock. |
| **Skills** (`skills`) | Complete + Narrow | Deterministic, rule-based extraction (summarize/risks/next/handoff/review-changes). Injected clock, no fuzzy matching, bounded output (≤20 risks, ≤10 tasks), English + Persian. `review-changes` compares inputs **within one invocation only**. |
| **CLI** (`cli`) | Complete + Narrow | Commands: `status`, `doctor`, `plan`, `brief`, `risks`, `next`, `handoff`, `install-preview`, `github <op>`, `providers status|doctor`. Brief/JSON/Markdown output; consistent exit-code convention (0 ok, 2 controlled/parse failure, 1 unexpected). Disk access is read-only; no CLI file writes. **No `--help` surface** (deferred follow-up L1). |
| **MCP** (`mcp-server`) | Complete + Narrow | Exactly **ten** read-only tools over stdio: `project_brief/risks/next/handoff`, `github_project_brief/risks/next/handoff`, `provider_status`, `github_provider_diagnostics`. No write tools, no HTTP, sanitized strict projections (comment/review bodies never exposed). **No installed MCP config generator** (deferred follow-up L2). |
| **Installer / release lifecycle** | Complete + Deferred | Preview-first, transactional, prefix-confined release install with rollback; deterministic reproducible archives; manually gated release workflows. A large body of installer **design scaffolding** (audit trails, write-approval tokens, execution plans) is in-memory/dry-run only and **not** a reachable public feature. The one real filesystem write adapter (`installer/src/node-write-filesystem.ts`) is **unwired** — no CLI command or MCP tool imports it. |
| **Security / privacy boundaries** | Complete | No project-file writes; no content upload; no telemetry; GitHub GET-only, env-only token never printed/persisted; MCP stdio-only, sanitized; config is read-only and rejects secret-marked keys. |
| **Deterministic guarantees** | Complete | "Same inputs plus same injected timestamp always produce deep-equal output." No `Date.now()`/random/real-clock in the analysis path. |
| **Local vs. network boundary** | Complete | Local Markdown flows fully offline; the GitHub GET transport is the sole network egress, opt-in only. |
| **Current write boundary** | Complete (as "none") | The analyzed project is only ever read. The only real disk writes are the unwired installer adapter and the prefix-confined release installer — never the analyzed project. |
| **Temporal state (memory over time)** | **Missing** | No database, no persisted cache, no snapshot store, no history — anywhere. This is the foundation v0.3 targets. |

### What must not be mistaken for a feature

- The installer **write adapter** exists but is unwired; it is not a public
  write capability.
- The contract **provider enum** lists seven ids; only two are enforced. The
  enum is not the supported-provider set.
- The `review-changes` **skill** compares within a single call; it is not
  change-over-time tracking.

## 2. Can the system do these today?

Each row is the honest answer for `v0.2.0`.

| Capability | Today? | Basis |
|---|---|---|
| Retain a previous observation | **No** | No persistence anywhere. |
| Identify a project consistently across runs | **No** | Nothing keys or stores a project identity; the root path is a transient CLI argument. |
| Compare two project observations | **No** | No stored prior observation to compare against. |
| Track evidence lineage over time | **No** | No evidence store; provenance is discarded after each run. |
| Represent durable decisions | **No** | Decisions are re-extracted each run; none are recorded as active/superseded. |
| Identify new / resolved / changed / stale risks | **No** | Requires a prior observation, which does not exist. |
| Measure evidence freshness | **Partial primitive only** | Overdue is computed from an injected `now`; there is no source-updated-vs-observed freshness because nothing is observed twice. |
| Rebuild derived state from evidence | **No** | No evidence is stored to rebuild from. |
| Export or delete local state | **N/A** | There is no local state to export or delete. |
| Recover from corrupted local state | **N/A** | No local state exists. |
| Migrate stored state between schema versions | **N/A** | No stored state. |
| Handle multiple project roots safely | **Partial** | Each run is a fresh, root-confined read; there is no cross-root state to keep separate, so there is nothing to get wrong — and nothing to get right, either. |

## 3. Gap classification

The findings sort cleanly into four buckets. Only the first is the v0.3 subject.

### Architecture gap (the v0.3 subject)

The product has **no provider-independent state layer**. There is no canonical
project state, no evidence ledger, no snapshot, no change engine, and no
freshness-over-time model. Every temporal question ("what changed", "which
decisions are active", "how fresh is this") is unanswerable for the same root
cause: nothing is remembered. This is a *foundation* gap, not a feature gap —
which is why filling it unblocks a whole class of later work rather than shipping
one more report.

### Product-capability gap

Downstream of the architecture gap: project-change reporting, decision tracking,
project-health, and readiness signals. Each of these is desirable, and each is
**blocked** on canonical state existing first. Building any of them before the
state layer would mean inventing a private, throwaway state model inside a single
report.

### UX gap (explicitly not the v0.3 headline)

- **L1** — no CLI `--help` surface.
- **L2** — no installed MCP client-config generator.

These are real and deferred, but they are polish, not foundation. Per the
decision rules, UX polish is not chosen as the headline of a minor version unless
it is the highest-value blocker — and it is not: a user who cannot see *what
changed* is more limited than one who must read the docs instead of `--help`.

### Maintenance defects (out of v0.3 scope; noted, not touched)

- `SECURITY.md` still says "No stable release is supported yet," which is stale
  now that `v0.2.0` is the published stable. This is a `v0.2.x` documentation
  correction, governed by the maintenance policy — **not** part of v0.3 and not
  modified by this discovery.
- Root `ROADMAP.md` and `docs/architecture.md` read as early-phase snapshots that
  lag `docs/roadmap.md`. Same disposition: maintenance-line docs, not v0.3.

## 4. The precise post-v0.2 gap, in one paragraph

OH MY PM can observe a project deterministically but cannot **remember** an
observation, **identify** the project it belongs to across runs, or **compare**
two observations over time. Everything a user would want next — what changed,
which risks are new or worsening, which decisions are still active, how stale the
understanding is, what the system knew before — is blocked on a single missing
foundation: a deterministic, privacy-preserving, local, provider-independent
project-state and evidence layer. That foundation is the v0.3 Project Brain.
