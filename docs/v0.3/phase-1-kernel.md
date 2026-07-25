# v0.3 Phase 1 — Deterministic Project Brain Kernel

## Status

**Phase 1 implemented and green. Phase 2 not started.** Source version remains
`0.2.0`. This phase adds a pure, deterministic Kernel module for the Phase 0
Project Brain contracts. It introduces **no persistence, no application-state
write, no project-file write, no filesystem/network/environment/clock/randomness
access, no Runtime orchestration, no CLI command, and no MCP tool**. The MCP
surface remains exactly ten tools; the Kernel WASM exports and `KernelApi` method
list are unchanged; `v0.2.x` remains maintenance-only.

## Authorized Scope

Phase 1 is limited to pure, deterministic Kernel behavior:

- normalization and validation of the Phase 0 contracts;
- network-free identifier derivation from caller-provided inputs;
- byte-stable canonical serialization;
- deterministic SHA-256 fingerprints;
- freshness derivation from injected timestamps;
- exact snapshot matching and deterministic change classification;
- golden fixtures and architecture guards.

Everything else — persistence, application-state writes, filesystem adapters,
database selection, Runtime capture/compare orchestration, CLI memory commands,
MCP tools, and new providers — is explicitly **out of scope** and deferred.

## Implemented Modules

All modules live under `kernel/crate/src/projectbrain/` and are pure:

| Module | Responsibility |
| --- | --- |
| `error.rs` | Typed `ProjectBrainError` with stable `OMP-K-PB-*` codes. |
| `limits.rs` | Bounded, deterministic validation limits. |
| `normalize.rs` | Display-text, label, id, map, and source-identity normalization. |
| `canonical.rs` | Canonical JSON serialization + domain-separated SHA-256. |
| `identifiers.rs` | Explicit / derived project identity resolution. |
| `time.rs` | RFC3339 / date parsing, age, and overdue derivation (no clock). |
| `freshness.rs` | The four freshness dimensions from injected timestamps. |
| `fingerprint.rs` | Content, evidence-id, state, and snapshot fingerprints. |
| `diff.rs` | Exact matching and deterministic ChangeSet generation. |
| `mod.rs` | Module wiring and pure public re-exports. |

`kernel/crate/src/lib.rs` exposes the module via `pub mod projectbrain;`. No
Project Brain logic lives in `wasm.rs`, `validation.rs`, `state.rs`,
`update_guard.rs`, or `errors.rs`.

## Normalization Rules

- **Display text** (titles, objective, display name, owner, gap reason): fold
  CRLF/CR to LF, trim surrounding Unicode whitespace, collapse internal Unicode
  whitespace runs to one ASCII space, preserve case, punctuation, and
  Persian/Arabic characters. No transliteration; no NFKC/NFKD folding.
- **Classification labels** (status, severity, priority): display-text
  normalization plus locale-independent Unicode lowercasing; punctuation kept.
- **Identifiers**: trim, reject empty, preserve case, reject control characters.
- **Maps** (metadata / provenance / status summary): keys trimmed and
  lowercased; colliding normalized keys rejected; secret-like structured keys
  rejected on their separator-stripped stem; `BTreeMap` ordering.
- **Source identities** (`rootHint`, evidence / descriptor / boundary
  `sourceIdentity`): reject absolute forms (POSIX, Windows drive, UNC,
  `file://`); fold backslashes to `/`; collapse duplicate separators; strip a
  leading `./`; strip a trailing slash unless the value is `.`; reject `..`
  segments and control characters. No filesystem access, no symlink resolution.
- **Duplicate handling**: duplicate `(kind, id)` items, duplicate source
  descriptors, and duplicate boundary `(identity, scope)` are rejected, never
  merged.
- **Bounds**: every collection and value has an explicit maximum; oversized
  input is rejected, never truncated.

## Identifier Rules

- **Explicit id**: trimmed, bounded, case-preserved; `kind = explicit`.
- **Derived id**: requires a caller-normalized root token and a caller-provided
  local salt; hashes a domain-separated payload; the token never appears in the
  output; `kind = derived`; format `project:sha256:<64 hex>`.
- **Domain separator**: `oh-my-pm:projectbrain:v1:project-identity`.
- **Salt**: caller-provided only. Phase 1 never creates, reads, stores, or
  persists a salt.
- The `rootHint` remains optional, non-absolute, and display-only.

## Canonical Serialization

A single canonical JSON encoder backs every fingerprint: UTF-8, lexicographically
sorted object keys, `BTreeMap` natural key order, no insignificant whitespace,
`serde_json` string escaping, canonical integer formatting, and semantic array
ordering (arrays whose order is non-significant are sorted before encoding). The
serialized size is bounded by `MAX_CANONICAL_BYTES` (32 MiB). The encoder reads
no clock, locale, or environment, and never uses `HashMap` iteration order,
`DefaultHasher`, memory addresses, or machine paths.

## Fingerprint Algorithms and Domain Separators

All fingerprints are domain-separated SHA-256 (lowercase hex, no separate hex
crate):

| Fingerprint | Domain separator | Format |
| --- | --- | --- |
| Evidence content | `oh-my-pm:projectbrain:v1:evidence-content` | `sha256:<64 hex>` |
| Evidence id | `oh-my-pm:projectbrain:v1:evidence-id` | `evidence:sha256:<64 hex>` |
| Project state | `oh-my-pm:projectbrain:v1:project-state` | `sha256:<64 hex>` |
| Project snapshot | `oh-my-pm:projectbrain:v1:project-snapshot` | `sha256:<64 hex>` |
| Project identity | `oh-my-pm:projectbrain:v1:project-identity` | `project:sha256:<64 hex>` |

- **State fingerprint** projects schema version, normalized identity, sources,
  status summary, objective, all six item collections, and sorted state evidence
  refs. It **excludes** `observedAt`, `Freshness`, and the existing
  `stateFingerprint` field, so re-observing unchanged state at a later time keeps
  the same semantic fingerprint.
- **Snapshot fingerprint** projects schema version, project id, `capturedAt`,
  normalized boundaries, the finalized state fingerprint, and sorted snapshot
  evidence refs. `snapshotId = snapshot:<hex>` reuses the fingerprint hex.
- The caller-supplied `stateFingerprint`, `fingerprint`, and `snapshotId` are
  never trusted: they are recomputed and replaced by `finalize_*`.

Repeated finalization of the same input is deep-equal, and the golden fixtures
pin exact hard-coded SHA-256 values.

## Freshness Rules

Ages are computed from a caller-injected `reference_at`; no clock is read.

- `observationFreshness`: age of the observation.
- `sourceFreshness`: maximum age across known source timestamps; `unknown` when
  none are known.
- `evidenceFreshness`: maximum age across known evidence timestamps; `unknown`
  when none are known.
- `derivedStateFreshness`: `max(observation age, evidence age)` when evidence is
  known; otherwise `unknown`.
- `coverageComplete` is true only when normalized coverage gaps are empty;
  coverage gaps are normalized, sorted, and deduplicated.
- A future timestamp within the allowed skew clamps to age `0`; beyond the skew
  it is rejected (`OMP-K-PB-1010`).

## Exact Matching

State items are flattened into one ordered map keyed by `(StateItemKind rank,
normalized id)` with the fixed rank order milestone, task, risk, decision,
dependency, blocker. Matching is exact only: no title similarity, no Levenshtein
distance, no embeddings, no fuzzy confidence. Same title with a different id
produces `removed` + `added`; same id with a different title produces a matched
`modified`. A duplicate key is a validation error.

## Change Classification

For each matched item the categories are evaluated in the fixed order resolved,
reopened, becameOverdue, noLongerOverdue, severityIncreased, severityDecreased,
fresh, stale, evidenceChanged, modified. A matched item may emit multiple
specific categories. `modified` is emitted only for field changes not fully
explained by a specific category (title, owner, priority, metadata, an
unrecognized status/severity change, or a due-date change with no overdue flip).

- **Status**: resolved-like = `resolved | closed | done | complete | completed`;
  open-like = `open | todo | planned | inprogress | active | reopened |
  blocked`. Non-resolved → resolved-like = `resolved`; resolved-like →
  open-like = `reopened`.
- **Severity ranks**: `info=0 low=1 medium=2 high=3 critical=4`; a higher rank is
  `severityIncreased`, a lower rank is `severityDecreased`; an unknown-label
  change is `modified` only.
- **Overdue** uses `previousSnapshot.capturedAt` and
  `currentSnapshot.capturedAt`, so a due date can cross between captures without
  reading a clock. A date-only due date is overdue only when the reference's UTC
  calendar date is later; an RFC3339 due timestamp is overdue when the reference
  instant passes it.
- **Evidence**: `evidenceChanged` fires when an item's sorted evidence refs
  differ, or a source-equivalent evidence record has a different content
  fingerprint. Raw content is never compared or stored.
- **Item fresh/stale**: an item's oldest contributing evidence age (via
  `sourceUpdatedAt`, else `observedAt`) is compared against
  `evidence_stale_after_seconds`.

Changes are ordered by `(item-kind rank, item id, category rank)`. The
`ChangeSet` carries structured previous/current values only — no prose, no score,
no raw body.

## Golden Fixtures

`examples/fixtures/project-brain/` holds the golden inputs and hard-coded
expected outputs: an unordered/normalized state pair with its exact state
fingerprint, previous/current snapshots and evidence sets, the expected
`ChangeSet`, and known/unknown freshness cases. Fixtures include English and
Persian text, reordered sources and evidence refs, all six `StateItemKind`
values, all twelve `ChangeCategory` values, partial coverage, a date-only and an
RFC3339 due date, an evidence-fingerprint change, and a same-title/different-id
`removed` + `added` pair. They contain no absolute path, credential, or raw body,
and use fictional project content.

## Purity and Privacy

The module performs no I/O: no filesystem, network, environment, system clock, or
randomness. A dedicated purity test statically proves the executable code
contains none of `std::fs`, `std::net`, `std::env`, `SystemTime`, `now_utc`,
`Instant::now`, process execution, or a WASM host import, and behaviorally proves
repeated runs are deep-equal. Error messages identify field paths only and never
echo private content, tokens, or absolute paths. Secret-like structured
metadata/provenance keys are rejected; ordinary human titles are never
secret-scanned.

## Dependencies

Two pure-Rust, WASM-compatible dependencies were added to
`kernel/crate/Cargo.toml`:

- `sha2 = "0.10"` — deterministic SHA-256.
- `time = { version = "0.3", default-features = false, features = ["parsing"] }`
  — RFC3339 / date parsing only, with no clock feature.

`Cargo.lock` changed only to add these and their pure-Rust transitive
requirements. No native library, OS service, randomness, networking, database, or
async runtime was added.

## Acceptance Evidence

- **G3** (deterministic snapshot fingerprint): same normalized input and caller
  timestamps produce the exact hard-coded snapshot fingerprint; proven by the
  golden fixtures and repeat-run equality.
- **G4** (deterministic change output): the same previous/current snapshots,
  evidence, `comparedAt`, and policy produce a deep-equal ordered `ChangeSet`;
  proven against the golden `changes-expected.json`.
- **G5 groundwork** (evidence traceability): every item preserves evidence refs;
  every emitted change preserves supporting evidence refs; missing evidence is
  rejected; state/snapshot refs are normalized deterministically. Full state
  rebuild remains Phase 3.
- **G14** (v0.2 unaffected): `version.json` and package versions stay `0.2.0`;
  the Kernel WASM exports, `KernelApi` methods, CLI, providers, installer, and
  release workflows are unchanged; the MCP surface remains exactly ten tools.

## Explicit Non-Implementation of Phases 2–6

Phase 1 does not implement any of the following, each of which requires separate
explicit approval:

- **Phase 2** — the local persistence interface and one explicit Node adapter.
- **Phase 3** — Runtime capture/compare orchestration and state rebuild.
- **Phase 4** — the minimal CLI surface.
- **Phase 5** — the minimal read-only MCP exposure.
- **Phase 6** — release qualification and a version bump.

No JSONL, SQLite, database, store, or repository adapter exists; no application
state is written; nothing is written inside analyzed projects.

## Known Limitations

- The Kernel rebuilds nothing from providers: it operates on caller-supplied
  contract values only. Provider-to-state derivation and full evidence-based
  state rebuild are Phase 3.
- No binding surface is exposed: the pure functions are Rust-only re-exports.
  Phase 3 will define the smallest required typed binding after the Phase 1
  semantics are frozen.
- Source-reported freshness for Markdown remains caller-supplied; the Kernel
  never infers a filesystem mtime.
