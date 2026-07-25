# v0.3 Data Model — Project Brain

This document defines the provider-independent contracts the Project Brain would
add. All are candidate designs for the discovery gate; none are implemented. They
follow the existing house rules: JSON schema is the single source of truth,
generated deterministically to TS and Rust; raw provider data never enters the
derived layer; the same inputs plus the same injected clock produce deep-equal
output.

Overriding principle: **raw evidence is kept separate from derived state, and
generated prose is never the only representation.** Everything a claim rests on
is a structured, minimized record.

## Contract inventory (interface budget: ≤ 6 new contracts)

| Contract | Role |
|---|---|
| `ProjectIdentity` | Deterministic, network-free identity for a project across runs. |
| `EvidenceRecord` | A minimized, sanitized record of one observed source item. |
| `ProjectState` | The canonical, provider-independent derived state at one observation. |
| `ProjectSnapshot` | An immutable capture: identity + state + evidence refs + fingerprint. |
| `ChangeSet` | The deterministic diff between two snapshots. |
| `Freshness` | The separated freshness/coverage model referenced by state and evidence. |

---

## 1. ProjectIdentity

### Options considered

| Approach | Verdict |
|---|---|
| Absolute path | Rejected as the identity — leaks a private path and breaks on move. |
| Normalized root path | Useful as a *hint*, not the identity (breaks on move/clone). |
| Repository remote identity | Rejected as sole identity — requires network / Git, absent for plain directories. |
| Explicit project ID (user-chosen) | Strong, portable, but optional. |
| Config-defined project ID | Same, sourced from `oh-my-pm.config.json`. |
| Content fingerprint | Rejected as identity — changes every time the project changes. |
| **Hybrid (recommended)** | Explicit/config ID when present; otherwise a deterministic derived id from a normalized, salted root token. |

### Recommendation — deterministic hybrid, no network

`ProjectIdentity` resolves in fixed precedence, entirely offline:

1. **explicit id** — a `projectId` in `oh-my-pm.config.json` (opt-in, portable,
   survives moves and clones);
2. **derived id** — otherwise, a deterministic hash of a *normalized* root token
   (lowercased drive on Windows, forward-slash separators, trailing-slash
   stripped) combined with a fixed local install salt, so the stored id is not a
   reversible plaintext path.

Fields:

| Field | Req. | Source of truth | Notes |
|---|---|---|---|
| `id` | required | explicit id, else derived | Stable string key for all storage. |
| `kind` | required | resolution path | `"explicit"` or `"derived"`. |
| `displayName` | optional | config / inferred title | For human-readable output only. |
| `rootHint` | optional | normalized root | A **non-absolute display token**, never the raw absolute path (matches the existing config display-path rule). |
| `schemaVersion` | required | contract | Identity contract version. |

### Edge cases and resolutions

| Situation | Resolution |
|---|---|
| Project moved to another directory | Same `explicit` id → same project. A `derived` id changes → treated as a new project (safe default; the user can pin an explicit id to keep continuity). |
| Same repository cloned twice | Two different roots → two `derived` ids by default. An explicit id would deliberately unify them (user's choice). |
| Directory without Git | Fully supported — identity never depends on Git or a remote. |
| Renamed repository | Irrelevant to identity (no remote dependence). |
| Monorepo subproject | The captured root is the subproject root; distinct roots yield distinct derived ids. An explicit id can scope a subproject. |
| Windows / macOS / Linux paths | Normalization folds separators and drive-letter case before hashing, so the same logical root is stable per platform; cross-platform continuity uses an explicit id. |
| Privacy of stored paths | Only the salted derived id and a non-absolute `rootHint` are stored; the raw absolute path is never persisted. |
| Export / import portability | An explicit id travels with the export; a derived id is documented as machine-local. |

Identity resolution performs **no network access** and reads no environment
secret.

---

## 2. ProjectState (canonical, provider-independent)

The derived, normalized view of a project at one observation. It is computed by
the pure Skill/kernel layers from evidence; it is never raw provider output.

| Field | Req. | Source of truth | Deterministic derivation / normalization | Stable id strategy | Privacy |
|---|---|---|---|---|---|
| `identity` | required | ProjectIdentity | resolved offline | — | salted id + non-absolute hint only |
| `observedAt` | required | injected clock | caller-injected `now`; never `Date.now()` | — | a timestamp, no content |
| `sources[]` | required | source descriptors | provider kind + sanitized source ref | source-ref key | no tokens, no raw bodies |
| `objective` | optional | evidence | extracted per existing rules | — | title-level only |
| `statusSummary` | required | evidence | existing summarize-status counts | — | counts, not content |
| `milestones[]` | optional | evidence | normalized title + optional due | normalized-title key | title + date only |
| `tasks[]` | optional | evidence | existing next-task extraction | id / doc-id+title / source-id | title-level |
| `risks[]` | optional | evidence | existing risk extraction (≤20) | id / doc-id+title / source-id | title-level + severity |
| `decisions[]` | optional | evidence | recognized decision sections | normalized-title key | title-level |
| `dependencies[]` | optional | evidence | recognized dependency markers | normalized-title key | title-level |
| `blockers[]` | optional | evidence | high-severity risk subset | risk id | title-level |
| `owners[]` | optional | evidence | explicit assignee/owner fields only | normalized handle | handle, never PII beyond the source's own handle |
| `dueDates` | optional | evidence | per-item, timezone-safe | item id | dates only |
| `priorities` | optional | evidence | existing priority markers | item id | label only |
| `evidenceRefs[]` | required | evidence ledger | ids of the EvidenceRecords backing this state | evidence id | ids only |
| `freshness` | required | Freshness model | derived from observed vs. source-updated | — | timestamps/coverage only |
| `schemaVersion` | required | contract | — | — | — |
| `stateFingerprint` | required | canonicalization | deterministic hash over canonicalized fields | — | a hash, no content |

Rules:

- Every non-trivial derived claim in `ProjectState` carries at least one entry in
  `evidenceRefs`, so state can be **rebuilt** from the evidence ledger.
- Stable identifiers reuse the **existing** dedup keys (candidate id;
  document-id + normalized title for Markdown; original source id for GitHub) — no
  new fuzzy identity is introduced.
- `stateFingerprint` is computed over a canonical serialization (sorted keys,
  fixed number formatting, normalized text) so two equal states hash equal on any
  platform.

---

## 3. EvidenceRecord (the evidence ledger)

One record per observed source item that backs a derived claim. This is the
minimized, sanitized substrate; derived state is rebuildable from it.

| Field | Req. | Notes |
|---|---|---|
| `evidenceId` | required | Stable id for this record. |
| `projectId` | required | Owning `ProjectIdentity.id`. |
| `sourceKind` | required | `"markdown"` \| `"github-issue"` \| `"github-pull-request"` \| `"github-repository"` \| `"structured"` \| `"generic"` (the existing source taxonomy). |
| `sourceIdentity` | required | Sanitized reference: document-relative path + line/range for Markdown; item number for GitHub. Never an absolute path, never a token. |
| `contentFingerprint` | required | Hash of the minimized observed text, so a change is detectable without storing the text verbatim. |
| `observedAt` | required | Injected clock at capture. |
| `sourceUpdatedAt` | optional | Source-reported update time (GitHub `updatedAt`; Markdown has no reliable per-line time — see Freshness). |
| `provenance` | required | Line/range (Markdown) or item provenance (GitHub), from the existing allow-list only. |
| `metadata` | optional | Sanitized, allow-listed fields only (severity, labels-as-classification, status) — never raw bodies. |
| `rawContentPolicy` | required | One of `not-stored` \| `minimized` \| `stored-opt-in` (see below). |
| `retentionState` | required | `active` \| `superseded` \| `pending-delete`. |
| `schemaVersion` | required | Contract version. |

### Raw-content decision (data minimization)

Default: **`minimized`** — store a `contentFingerprint` plus the already-
allow-listed provenance/metadata fields, **not** the verbatim source text. This
is enough to detect change and to explain a change ("this risk line changed")
without becoming a private-content store.

- **`not-stored`** — even the fingerprint is omitted for a source kind the user
  excludes.
- **`stored-opt-in`** — verbatim minimized text stored **only** when the user
  explicitly enables it, and never for GitHub bodies that the MCP layer already
  refuses to project.

Credentials are **never** stored in any policy. Provider responses are never
stored wholesale. The default is the most private option that still supports
deterministic change detection.

---

## 4. ProjectSnapshot (immutable capture)

| Field | Req. | Notes |
|---|---|---|
| `snapshotId` | required | Stable id. |
| `projectId` | required | Owning identity. |
| `capturedAt` | required | Injected clock. |
| `sourceBoundaries` | required | Which sources/sections were in scope (so a partial capture is honest about coverage). |
| `state` | required | The canonical `ProjectState`. |
| `evidenceRefs[]` | required | The `EvidenceRecord` ids this snapshot froze. |
| `schemaVersion` | required | Contract version. |
| `fingerprint` | required | Deterministic hash over `state.stateFingerprint` + sorted evidence ids + boundaries. |

A snapshot is immutable once written. The `fingerprint` is **deterministic**:
capturing the same project with the same inputs and injected clock yields an equal
fingerprint (acceptance gate G3).

---

## 5. ChangeSet (deterministic diff)

The diff between a `previous` and a `current` snapshot. Rule-based, no fuzzy
matching.

### Change categories

`added` · `removed` · `modified` · `resolved` · `reopened` · `became-overdue` ·
`no-longer-overdue` · `severity-increased` · `severity-decreased` · `fresh` ·
`stale` · `evidence-changed`.

### Stable matching rules (per item type)

Matching uses the **existing** stable identifiers only:

| Item type | Match key |
|---|---|
| tasks | candidate id → doc-id + normalized title → source id |
| risks | candidate id → doc-id + normalized title → source id |
| decisions | normalized decision-section title |
| milestones | normalized milestone title |
| dependencies | normalized dependency title |

### No-fuzzy rule

The first version uses **exact/normalized** matching only. **When identity is
uncertain, a `removed` + `added` pair is emitted rather than an unverifiable
`modified` claim.** This mirrors the existing extraction philosophy (exact label
matching, `unblocked` never matches `blocked`) and keeps change output
defensible. A `modified`/`severity-*`/`evidence-changed` result is emitted only
when the match key is identical and a specific field differs.

Overdue transitions (`became-overdue` / `no-longer-overdue`) are computed only
from the injected `now`, reusing the existing timezone-safe overdue rules.

The whole `ChangeSet` is deterministic: same two snapshots → deep-equal changes
(acceptance gate G4).

---

## 6. Freshness

Freshness is **separated into four kinds**, never collapsed into one opaque
score, and never an AI confidence number.

| Kind | Meaning | Derivation |
|---|---|---|
| `observationFreshness` | How long ago this snapshot was captured | injected `now` − `capturedAt` |
| `sourceFreshness` | How recently each source reported an update | `now` − `sourceUpdatedAt` where available |
| `evidenceFreshness` | How recently each evidence item's content last changed | `now` − last `contentFingerprint` change |
| `derivedStateFreshness` | How current the canonical state is relative to its evidence | oldest contributing evidence freshness + coverage |

### Hard cases

| Case | Resolution |
|---|---|
| Local files without reliable timestamps | Markdown has no trustworthy per-line time; `sourceFreshness` is marked `unknown` for Markdown and freshness leans on `contentFingerprint` change between snapshots, not filesystem mtime. |
| GitHub `updatedAt` present | Used directly for `sourceFreshness`. |
| Missing timestamps | Recorded as `unknown`, never guessed. |
| Provider failure | The affected source is marked as a **coverage gap**, not silently treated as fresh. |
| Partial observation | `sourceBoundaries` records what was and was not observed; freshness/coverage reflect the gap. |
| Deterministic tests | `now` is injected, so freshness is fully reproducible; there is no `Date.now()`. |

### Confidence / completeness

Any completeness or confidence indicator is derived **only** from explicit
freshness and coverage rules (which sources were observed, how recently, with
what gaps) — never from a learned or probabilistic score.

---

## Cross-cutting guarantees

- **Rebuildable:** derived `ProjectState` can be regenerated from the
  `EvidenceRecord` set for a snapshot (acceptance gate G5).
- **Minimized:** the default stores fingerprints + allow-listed fields, not raw
  content; credentials are never stored.
- **Deterministic:** fingerprints and change sets are stable across platforms for
  the same inputs and injected clock.
- **Sanitized for MCP:** any future MCP projection over this data reuses the
  existing sanitization rules (no raw bodies, no tokens, no absolute paths).
