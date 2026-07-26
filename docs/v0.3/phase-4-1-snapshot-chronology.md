# v0.3 Phase 4.1 — Snapshot Capture Chronology Correction

## Status

**Implemented and green.** Phase 4.1 corrects a semantic chronology defect in the
Phase 4 baseline: `memory history` and the default `memory changes` comparison
used a content-derived, lexically sorted Snapshot-ID order instead of the actual
capture order. The correction introduces an authoritative capture chronology in
the Project Memory manifest (internal store format **2**), a production `1 -> 2`
migration that recovers the best deterministic chronology a store-format v1 store
can yield, and a Runtime default comparison that always compares the latest
committed capture with the capture committed immediately before it. The Project
Brain contract schema stays **1**, `version.json` stays **0.2.0**, the MCP surface
stays exactly ten tools in its existing order, and the v0.2 release bundle still
excludes `@oh-my-pm/project-memory`. Phase 5 remains blocked until this correction
is green and separately reviewed.

## Problem and user impact

The Phase 4 baseline used `ProjectStoreManifest.snapshotIds` as the snapshot
listing source. `buildNextManifest` converted the ids to a set and stored them
lexicographically sorted; `listSnapshots` returned that sorted order; the Runtime
default compare selected the predecessor of `latestSnapshotId` from that order;
and `memory history` presented the same order.

Snapshot IDs are content-derived (a fingerprint), so their lexical order is
unrelated to capture order. After captures `A -> B -> C`, the stored ID order
could be `B -> A -> C`, so:

```text
memory history            != capture history
default memory changes    != latest capture vs. immediately previous capture
```

Users saw history out of order and, worse, a default "what changed since last
time" that could diff against the wrong prior capture.

## Root cause

- **Manifest inventory behavior:** `snapshotIds` was a lexically sorted set —
  a deterministic *inventory*, never a chronology — but it was used *as* the
  chronology.
- **List behavior:** `listSnapshots` mapped that sorted inventory directly.
- **Default compare behavior:** the Runtime picked the predecessor of the latest
  pointer within the sorted list, with a lexical-order fallback heuristic when the
  latest was first or missing.

The defect is reproduced by any store whose lexical ID order differs from capture
order (see the four-snapshot tests below).

## The v2 chronology model

Store format advances to **2**. The application-data directory namespace/path is
unchanged — a store is not moved merely because the internal manifest format
advances.

The manifest gains an authoritative capture chronology:

```ts
interface SnapshotHistoryEntry {
  readonly snapshotId: string;
  readonly capturedAt: string; // equals the persisted Snapshot payload's capturedAt
  readonly sequence: number;    // contiguous 1..N, oldest capture first
}
```

added to `ProjectStoreManifest` as:

```text
snapshotHistory: SnapshotHistoryEntry[]
snapshotChronologyOrigin: "native" | "recoveredV1"
```

### Inventory versus chronology

| Field | Role | Order |
| --- | --- | --- |
| `snapshotIds` | deterministic inventory of unique committed ids | may stay lexically sorted (inventory / integrity / export) |
| `snapshotHistory` | **authoritative capture chronology** | oldest capture first, contiguous `sequence` 1..N |
| `latestSnapshotId` | latest committed capture | equals the final `snapshotHistory` entry; null only when history is empty |

The authoritative order is **`sequence`** — never a lexical ID order and never a
fresh clock read.

### Invariants (integrity-protected)

The manifest integrity digest covers `snapshotHistory` and
`snapshotChronologyOrigin`. On every read, after integrity verifies, the store
also structurally enforces:

- every `snapshotIds` value appears exactly once in `snapshotHistory`;
- every history entry references an id present in the inventory;
- no duplicate Snapshot ID and no duplicate sequence;
- sequence is contiguous `1..N` in oldest-first order;
- `latestSnapshotId` equals the final history entry (null iff empty);
- `snapshotChronologyOrigin` is a known value;
- the chronology is well-formed and not oversized;
- (via `verify`) each entry's `capturedAt` equals its Snapshot record's own
  `capturedAt`.

Any violation is a controlled corruption/integrity error, surfaced by `inspect`
as an integrity issue. There is **no** silent fallback to lexical order anywhere.

## Commit behavior

`buildNextManifest`:

- **New store:** `snapshotHistory = [{ snapshotId, capturedAt, sequence: 1 }]`,
  `latestSnapshotId = snapshotId`, `snapshotChronologyOrigin = "native"`,
  `snapshotIds = sorted unique inventory`.
- **Existing v2 store, new Snapshot:** append one entry with
  `sequence = previous final sequence + 1`; `latestSnapshotId = new id`; origin
  preserved.
- **Idempotent Snapshot:** no new history entry, no sequence increment, no
  latest-pointer mutation, no manifest rewrite solely for idempotency.

The history entry's `capturedAt` is the finalized Snapshot payload's own
`capturedAt`, validated at commit time. **No system clock is read** for
chronology.

## Record-envelope compatibility (mixed v1/v2)

Snapshot and Evidence envelope shapes are unchanged. A v2 manifest may reference
valid immutable record envelopes written under store format 1 or 2:

- immutable record payloads are **never** rewritten merely to change chronology;
- each envelope's integrity is verified under its own declared version/shape;
- an envelope version newer than the reader is rejected; supported older
  envelopes (unchanged shape) are accepted;
- new records written after this correction use store format 2;
- export and verify support a v2 manifest containing valid v1 and v2 envelopes.

## Migration: store format 1 -> 2

A single real production migration `1 -> 2` is registered in the default
production registry wired into the Node adapter. It uses the existing migration
mechanism: exclusive project lock, source verification, backup before mutation,
a pure deterministic transform, an atomic manifest commit, post-migration
verification, a `migrationHistory` entry, and a retained backup. **Migration never
runs on a read.**

### Deterministic recovery algorithm

The v1 manifest lost the exact order of historical entries because `snapshotIds`
was sorted. The migration recovers the best deterministic chronology:

1. read and integrity-verify every Snapshot referenced by the v1 manifest;
2. obtain and validate each payload's `capturedAt`;
3. remove `latestSnapshotId` from the sortable historical pool;
4. sort the remaining snapshots by **`capturedAt` ascending, then `snapshotId`
   ascending**;
5. append `latestSnapshotId` **last**;
6. assign contiguous `sequence` values `1..N`;
7. set `snapshotChronologyOrigin = "recoveredV1"`;
8. retain the sorted unique `snapshotIds` inventory;
9. preserve all Evidence records and immutable Snapshot payloads;
10. record the migration in `migrationHistory`.

The known latest capture is pinned last because `latestSnapshotId` is the only
authoritative commit-recency fact the v1 manifest retained.

### Documented limitation

Exact relative commit order among older v1 snapshots cannot always be
reconstructed when `capturedAt` values were equal or non-monotonic. The migration
is deterministic, pins the known latest capture correctly, and **all v2 captures
committed after the migration are exact**. This does not claim to reconstruct
information v1 never preserved. A migrated store's origin stays `recoveredV1` for
the life of the store, including after later exact v2 captures.

## Explicit CLI migration flow

No seventh subcommand is added; the six `memory` subcommands are unchanged. The
existing `memory capture` preview/apply flow is the explicit write boundary, with
one capture-only option, `--migrate-store`:

```text
memory capture --migrate-store
  preview only; reports that a store-format v1 store would migrate to v2;
  zero writes and zero locks (wouldMigrateStore: true in structured output).

memory capture --apply --migrate-store
  migrates v1 -> v2 exactly once, then performs the requested capture once
  (storeMigrated: true in structured output).

memory capture --apply  (v1 store, no --migrate-store)
  exit 4 (migrationRequired); no write.
```

`--migrate-store` is rejected on `changes`, `status`, `history`, `export`, and
`delete`. Read-only commands on a v1 store continue to report `migrationRequired`
and never auto-migrate. If migration succeeds but the subsequent capture fails,
the structured output reports the sanitized failure **and** `storeMigrated: true`;
it never claims the capture succeeded. No migration occurs for a missing store or
an already-v2 store.

## History and default-compare behavior

- **`memory history`** presents **newest capture first** (the authoritative
  chronology reversed for presentation only), with each record's `snapshotId`,
  `capturedAt`, `sequence`, and `isLatest`, plus a command-level
  `chronologyOrigin`. It returns no full state and no Evidence payloads.
- **Default `memory changes`** compares the latest committed capture with the
  capture committed immediately before it, derived from the capture chronology.
  Explicit `--previous/--current` selection is unchanged and exact.
- The Runtime default selection reads `listSnapshots` (chronological, oldest
  first): `current` is the final entry (which must equal `manifest.latestSnapshotId`
  — a mismatch fails safely as a stored-record error), and `previous` is the entry
  immediately before it. The former lexical-order fallback heuristic is removed.

## Preview compatibility

The capture preview projects the same chronology semantics as a real v2 commit:
a projected history entry is appended only for a new Snapshot; an idempotent
preview does not increment the sequence; preview and apply produce the same
Snapshot ID, fingerprints, projected count, and sequence under fixed inputs. A v1
preview with `--migrate-store` projects the deterministic recovered chronology
plus the new capture. The preview creates no directory, file, manifest, record,
backup, staging path, or lock — it is never implemented by writing and rolling
back.

## Atomicity and integrity

The atomic commit point remains the manifest rename. The migration backs up
before mutating and verifies after committing; a transform that produces an
inconsistent chronology fails closed in `buildManifest` **before** the atomic
commit, leaving the backup and original v1 store intact and readable.

## Privacy

No raw document body, provider token, or absolute path is stored, exported, or
printed. `capturedAt` is a caller-injected timestamp already present on the
Snapshot; the chronology adds an ordinal and mirrors that timestamp. History and
status output remain bounded and sanitized in brief/JSON/Markdown.

## Acceptance evidence

- **Native v2 chronology** (`project-memory/test/chronology.test.ts`): captures
  `A -> B -> C` with ids whose lexical order differs; `listSnapshots` returns
  `A -> B -> C`; sequences `1,2,3`; latest is `C`; origin `native`; idempotent
  re-capture of `C` appends nothing and keeps sequence `3`; every corruption shape
  (duplicate id, duplicate sequence, sequence gap, missing inventory id, unknown
  history id, capturedAt mismatch, latest mismatch, invalid origin, tampered
  integrity) is a controlled error.
- **Migration recovery** (`project-memory/test/migration-chronology.test.ts`): a
  v1 store whose sorted inventory places the latest in the middle migrates
  deterministically; older entries sort by `capturedAt` then id; latest is pinned
  last; origin `recoveredV1`; sequence contiguous; equal-`capturedAt` ties break
  by id; a backup exists; `migrationHistory` records `1 -> 2`; immutable records
  are byte-identical; a pre-commit failure leaves the v1 store readable; migration
  never runs on a read; a later v2 capture appends an exact entry.
- **Runtime default compare**
  (`runtime/test/projectbrain-compare-chronology.test.ts`): four captures with a
  lexical/capture-order mismatch select the immediate predecessor; explicit pair
  selection stays exact; a chronology that disagrees with the latest pointer fails
  safely.
- **CLI** (`cli/test/memory-chronology.test.ts`): history uses capture order
  (newest first); default changes uses the immediate predecessor; v1 preview
  reports `wouldMigrateStore`; `--apply` on v1 without `--migrate-store` exits 4
  and writes nothing; `--migrate-store` preview writes nothing;
  `--apply --migrate-store` migrates once and captures once; `--migrate-store` is
  rejected on every other subcommand; JSON output stays sanitized.

## Phase 5

**Phase 5 remains blocked** until this Phase 4.1 correction is green and reviewed
separately. This task implements Phase 4.1 only.
