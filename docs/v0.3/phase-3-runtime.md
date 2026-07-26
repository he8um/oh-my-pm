# v0.3 Phase 3 — Provider-Independent Runtime Capture and Compare

## Status

**Implemented and green.** Phase 3 connects the already-implemented foundations
into a working vertical slice that runs **programmatically below the CLI**:
read-only provider observation → pure Skills state/evidence derivation → Phase 1
Kernel finalization/fingerprints → Phase 2 Project Memory transaction → read
snapshots/evidence → Phase 1 Kernel deterministic diff. It adds **no** public CLI
`memory` command, **no** MCP tool or change, **no** provider change, **no**
provider→memory dependency, **no** contract or Phase 1/Phase 2 semantic change,
**no** project-file write, and **no** network/telemetry outside the existing
explicit providers. `version.json` remains `0.2.0`, the MCP surface remains
exactly ten tools in its existing order, and the existing `Runtime.handle()`
behavior is unchanged. Phases 4–6 remain unstarted; each requires a separate,
explicit approval.

## Authorized Scope

Phase 3 implements: a non-CLI Project Brain Runtime API (capture + compare); the
narrow dependency ports it depends on; the smallest Kernel WASM/TypeScript
binding required to invoke the seven existing Phase 1 functions; a pure Skills
state-derivation module; the evidence minimization pipeline; partial-observation
coverage handling; end-to-end tests below the CLI; architecture guards; and this
document.

Explicitly out of scope and not implemented: public CLI memory commands; MCP
changes or a new MCP tool; provider implementation changes; a provider depending
on memory; new providers; changes to the Phase 0 contracts, Phase 1 Kernel
semantics, or Phase 2 storage format; project-file or hidden application-state
writes; network outside existing providers; telemetry; cloud sync; a version
bump; a release/tag; and Phase 4–6 work.

## Runtime API

A **separate** programmatic surface under `runtime/src/projectbrain/**`, exposed
from `@oh-my-pm/runtime`:

```ts
export function createProjectBrainRuntime(
  deps: ProjectBrainRuntimeDeps,
): ProjectBrainRuntime;

interface ProjectBrainRuntime {
  capture(input: CaptureProjectInput): Promise<CaptureProjectResult>;
  compare(input: CompareProjectInput): Promise<CompareProjectResult>;
}
```

The existing `createRuntime(deps)` and `Runtime.handle(request)` are byte-stable:
`status`, `doctor`, `plan`, unsupported request kinds, and validation failures
behave exactly as before. No new `RuntimeRequest` kind is added for capture or
compare — the Project Brain API is a workspace/programmatic surface only, not a
CLI or MCP surface.

## Dependency Ports

`ProjectBrainRuntimeDeps` depends only on interfaces, never on Node
implementations:

- **`ProjectBrainKernelPort`** — the seven pure Kernel operations, structurally
  the binding's `ProjectBrainKernelApi`.
- **`ProjectMemoryPort`** — `readManifest`, `listSnapshots`, `readSnapshot`,
  `readEvidence`, `commitSnapshotBundle` — structurally the Phase 2 store.
- **`ProjectObservationPort`** — `observe(request, { requestId })`.
- **`ProjectStateDeriver`** — the pure Skills derivation function.

Rules enforced by guards and the purity tests: Runtime source imports no
`node:fs`/`node:path`/`node:os`/`node:crypto`/`node:child_process`/networking;
Runtime never constructs the Node memory adapter; Runtime source never imports
`@oh-my-pm/project-memory` (only the e2e test does, via a devDependency);
providers import neither Runtime nor Project Memory; Project Memory imports no
Runtime; Skills remain pure; no circular workspace dependency exists. The real
adapter is used only in the integration/e2e test through a structural port; the
type-only compatibility is erased from built JavaScript, the v0.2 bundle still
resolves without project-memory, and project-memory stays excluded from the v0.2
bundle.

## Kernel Binding Surface

Phase 1 implemented the Project Brain semantics in Rust but deliberately exposed
no binding. Phase 3 adds the smallest binding surface required. The four existing
WASM exports (`kernelVersion`, `validateJson`, `checkUpdatePlan`,
`decideTransition`) and the four existing `KernelApi` methods are unchanged; the
Project Brain methods live on a **separate** `ProjectBrainKernelApi`, not on
`KernelApi`.

Binding result envelope:

```ts
type ProjectBrainKernelResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; path?: string } };
```

Exactly seven operations are exposed: `deriveProjectIdentity`,
`fingerprintMinimizedContent`, `deriveEvidenceId`, `deriveFreshness`,
`finalizeProjectState`, `finalizeProjectSnapshot`, `diffProjectSnapshots`. Each
parses typed JSON, invokes the existing Phase 1 function, and serializes a
deterministic envelope; invalid JSON or a Kernel error is returned as a
serialized `{ ok: false, error }` value — never a WASM throw — preserving the
existing fail-closed behavior. `createUnavailableProjectBrainKernelApi()` fails
closed for every operation. Phase 1 algorithms are unchanged; persistence is
never exposed through the Kernel binding. Native and WASM results are proven
semantically identical on pinned golden fixtures
(`kernel/crate/tests/projectbrain_binding_parity.rs` +
`kernel/binding/test/wasm-projectbrain-api.test.ts`), so the crate now compiles
eleven WASM exports total.

## Observation and Coverage

Observations execute **sequentially in input order** through
`ProjectObservationPort`. A default adapter wraps the existing read-only
`ProviderRegistry`. Coverage rules:

```
provider success without warnings -> complete
provider success with warnings    -> partial
optional provider failure         -> skipped
required provider failure          -> capture failure (no commit, no snapshot)
```

Gap reasons use stable sanitized codes only; raw provider error messages and
failed response payloads are never persisted. An optional-source failure records
skipped coverage and continues; a required-source failure aborts capture before
any write. Providers stay entirely unaware of memory, snapshots, and capture.

## Skills State Derivation

`skills/src/project-brain-state.ts` is a pure add. It accepts normalized provider
items plus coverage, reuses the existing deterministic risk/next-task extraction
and Markdown section parsing, and produces canonical state-item drafts and
minimized evidence candidates. It performs no I/O, reads no clock/environment/
network/randomness, registers **no** new `SkillId`, and leaves the Skill registry
unchanged.

State classification uses explicit source signals only (no unrestricted-prose
inference): tasks (existing next-task candidates + explicit items + exact-rule
GitHub follow-ups); risks (existing risk candidates + explicit labels/markers +
blocked/overdue rules); blockers (explicit blocker signals only — never every
high-severity risk); decisions/dependencies/milestones (explicit records/markers/
headings only). Ids reuse existing candidate/source ids or deterministic
source-based ids; duplicates are rejected rather than merged; English and Persian
display text is preserved; output is deterministically ordered with documented
per-kind bounds.

Evidence candidates carry an **ephemeral** `fingerprintInput` used only to
compute a content fingerprint through the Kernel; it never reaches Project Memory
or any public Runtime result.

## Evidence Minimization

For each candidate the Runtime builds a bounded minimized fingerprint input in
memory, calls Kernel `fingerprintMinimizedContent`, constructs an
`EvidenceRecord` with `rawContentPolicy = "minimized"`, calls Kernel
`deriveEvidenceId`, maps the candidate id to the final evidence id, and discards
the `fingerprintInput` and all raw provider responses before commit. Persisted
evidence carries only: `evidenceId`, `projectId`, `sourceKind`, `sourceIdentity`,
`observedAt`, optional `sourceUpdatedAt`, allow-listed `provenance`/`metadata`,
`contentFingerprint`, `rawContentPolicy = minimized`, `retentionState = active`,
`schemaVersion = 1`. Phase 3 never uses `notStored` or `storedOptIn`. A
pre-commit scan proves the finalized snapshot and every evidence record contain
no forbidden raw/provider/secret/path field, including `fingerprintInput`.

Because the Kernel derives an evidence id from content (not capture time), a
re-observation of unchanged content yields the same id; the Runtime reuses the
already-committed record for such an id so the record stays byte-identical and
the commit is idempotent, while a content change yields a new id and record.

## Capture Pipeline

```
1. validate input; resolve identity through the Kernel (no salt generated);
2. run observations sequentially; classify coverage; collect items;
3. derive provider-independent state + minimized evidence candidates (pure);
4. minimize evidence through the Kernel; reconcile with the store for idempotency;
5. map drafts -> canonical items with final evidence ids;
6. derive freshness through the Kernel;
7. finalize ProjectState through the Kernel (authoritative);
8. finalize ProjectSnapshot through the Kernel (final id + fingerprint);
9. pre-commit privacy scan;
10. commit exactly one snapshot bundle through the memory port.
```

## Transaction Boundary

`commitSnapshotBundle` is the FIRST and ONLY write. No write occurs before it; a
failure at any earlier step persists nothing. There is no partial commit and no
hidden retry loop. An idempotent result is surfaced accurately; a failed commit
never claims capture success; a persistence error maps to a sanitized Runtime
error. The analyzed project stays byte-identical.

## Compare Pipeline

```
1. validate input; select two snapshots (explicit pair or default latest-two);
2. read + verify both snapshots and their referenced evidence (deduped, sorted);
3. call the existing Kernel diffProjectSnapshots (authoritative);
4. return a sanitized ChangeSet.
```

Compare performs no write and acquires no write lock. The Runtime implements no
matching, classification, or reordering — the Kernel output is authoritative.

## Snapshot Selection

```
explicit: both ids required, ids must differ, both must exist in the store
default: current = latest committed, previous = immediately preceding
no store: noPriorMemory
one snapshot: insufficientHistory
```

No-history outcomes are controlled statuses, not corruption.

**Phase 4.1 chronology correction.** The default pair is derived from the memory
port's authoritative capture chronology (`listSnapshots`, oldest first): `current`
is the final chronological entry (which must equal `manifest.latestSnapshotId`, or
the compare fails safely as a stored-record error) and `previous` is the entry
immediately before it. The former lexical-order fallback heuristic is removed —
selection follows real capture order, never a content-derived ID order. Explicit
`--previous/--current` selection is unchanged. See
[phase-4-1-snapshot-chronology.md](phase-4-1-snapshot-chronology.md).

## Error Model

Stable Phase 3 codes: `OMP-R-PB-6001` invalid input, `6002` dependency
unavailable, `6003` Kernel operation failed, `6004` required observation failed,
`6005` state/evidence derivation failed, `6006` persistence commit failed, `6007`
no prior memory, `6008` insufficient history, `6009` stored record read failed,
`6010` compare failed, `6011` limit exceeded. Errors never expose raw provider
messages, payloads, tokens, content, salts, root tokens, or full filesystem
paths.

## Determinism

The same inputs and injected timestamps produce deep-equal capture and compare
results. The Runtime reads no system clock, generates no random id (identity,
evidence id, snapshot id, and fingerprints are all Kernel-derived), and adds no
fuzzy matching or LLM call.

## Privacy and Security

No raw Markdown document, raw GitHub body/PR/comment/review/diff, provider
response object, token, authorization value, cookie, environment secret, absolute
project path, salt, root token, or `projectRootBoundary` is persisted. The
`projectRootBoundary` is passed to the memory port as a write-safety boundary and
is never written into a record (Phase 2 guarantee). The e2e test plants a fake
token, a raw body, and an absolute path in provider data and proves none reaches
any stored byte, and that the analyzed project is byte-identical after the whole
flow.

## Provider Isolation

Production code under `providers/**` is byte-unchanged. Providers know nothing of
memory, snapshots, data paths, or capture. The Runtime observation adapter alone
maps provider results into coverage.

## Persistence Compatibility

The Phase 2 storage format, manifest, integrity, locking, export, delete, and
migration behavior are unchanged. There are no production changes under
`project-memory/src/**`. The Node adapter satisfies the Runtime memory port
structurally, and the existing Project Memory tests remain green.

## Test Evidence

- **Kernel binding:** the seven approved methods exist; the four existing exports
  and `KernelApi` methods remain; native/WASM outputs match pinned golden
  fixtures; invalid JSON returns a typed failure; the unavailable binding fails
  closed.
- **Skills derivation (18 tests):** local Markdown, GitHub, and mixed input;
  English and Persian; all six state-item kinds via explicit signals; duplicate
  rejection and deterministic order; bounds; partial/skipped gaps; no registry id
  change; no raw provider object in output; adversarial fake token/path fixtures.
- **Runtime capture (11 tests):** success; required failure → zero commits;
  optional failure → skipped coverage; warnings → partial coverage; Kernel/memory
  failure → failure with no false success; idempotency surfaced; sequential
  execution; raw provider data discarded; deep-equal on identical inputs.
- **Runtime compare (7 tests):** no store; one snapshot; latest-two selection;
  explicit pair; invalid explicit selection; missing/corrupt evidence;
  deterministic success; no write.
- **End-to-end below CLI (4 tests):** real ProviderRegistry-style observation,
  real pure deriver, real WASM Kernel binding, real Node Project Memory adapter,
  a temporary data directory outside the repository and a temporary analyzed
  project; capture A → capture B (changed observation) → compare latest two with
  a deterministic ChangeSet; partial optional source; required-failure and
  adapter-failure rollback; idempotent repeat; project bytes unchanged; stored
  bytes scanned for forbidden values. No CLI process or MCP server is launched.

## Acceptance Status

- **G3 preserved** — deterministic fingerprints are Kernel-derived and unchanged.
- **G4 exercised end-to-end** — the deterministic diff runs over committed
  snapshots and yields a golden ordered ChangeSet.
- **G5 preserved** — evidence refs are preserved through state, snapshot, and
  diff.
- **G6 groundwork only** — the Runtime capture/compare API exists; the public CLI
  `memory` command is deferred to Phase 4. (Not full user-visible G6.)
- **G7–G11 preserved** — export/delete, corruption safety, concurrency, and the
  no-credentials/no-telemetry posture are unchanged.
- **G14** — v0.2 is unaffected (version, MCP ten-tool surface/order, providers,
  `Runtime.handle`, and the release bundle are unchanged).

## Explicit Non-Implementation of Phases 4–6

Phase 4 (the minimal preview-first CLI `memory` surface) is **not started**. No
CLI parsing, command output, or process behavior for capture/compare exists; no
MCP tool invokes the Project Brain Runtime; capture and compare work only
programmatically below the CLI. `version.json` remains `0.2.0`. Phases 5 (MCP
exposure) and 6 (release qualification) are likewise not started. Each remaining
phase requires a separate, explicit approval.
