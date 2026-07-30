# OH MY PM — v0.4 Project Timeline

> **Status: scope and architecture locked.** v0.4 builds exactly one capability:
> **Project Timeline** — a local, bounded, deterministic history of project
> changes derived from already-committed Project Brain snapshots, exposed to
> humans through one new CLI subcommand (`memory timeline`) and to agents through
> one new read-only MCP tool (`project_timeline`).
>
> v0.4 adds **no** new storage, **no** schema change, **no** migration, **no**
> capture trigger, **no** write path, and **no** network path. The published
> `v0.3.1` release remains immutable and its stores keep working unchanged.

## North Star

> OH MY PM can answer "what changed in this project, and when?" from local
> committed memory alone — deterministically, in authoritative capture order,
> bounded and filterable, without capturing anything, writing anything, or
> uploading anything.

The v0.3 Project Brain can already answer "what changed between the last two
captures?" (`memory changes` / `project_changes`). It cannot answer "what changed
over the whole recorded history?" — the one question that turns a pair of
snapshots into a project narrative. Project Timeline closes exactly that gap and
nothing more.

## Scope

v0.4 delivers:

1. three versioned, bounded contracts — `TimelineEvent`, `TimelineQuery`,
   `TimelineResult`;
2. one pure, deterministic derivation over adjacent committed snapshots, placed
   in the deterministic domain layer and reusing the existing Kernel change
   engine;
3. one provider-independent, read-only Runtime timeline query;
4. one new CLI subcommand, `memory timeline` (the seventh, and last, memory
   subcommand);
5. one new read-only stdio MCP tool, `project_timeline` (the twelfth, appended
   after the existing eleven);
6. installed qualification of compatibility, limits, privacy and failure safety;
7. distribution, documentation and a gated stable `v0.4.0` release.

## Non-goals

Explicitly out of scope for v0.4, and guarded against:

| Excluded | Why |
|---|---|
| controlled write-back | separate approval; v0.4 stays read-only |
| MCP write tools | the MCP surface stays zero-write |
| project-file writes | the v0.2 trust model is unchanged |
| timeline editing | a timeline is derived, never authored |
| persisted timeline-event storage | events are derived per query, never stored |
| store format 3 | store format stays `2` |
| Project Brain schema changes | schema stays `1` |
| automatic capture | capture stays explicit and user-invoked |
| filesystem watchers, scheduled/background capture | no ambient process |
| cloud sync, telemetry, dashboard, web UI | local-first, no upload |
| new providers, provider aliases/profiles | timeline never touches a provider |
| global multi-workspace aggregation | one project id per query |
| semantic search, vector search | the taxonomy is exact/normalized only |
| LLM-generated timeline summaries | derivation is rule-based and deterministic |
| notifications, interactive prompts | no ambient or blocking UX |
| HTTP MCP, additional MCP transports | stdio only |
| package registry publication | GitHub Releases only |
| new dependencies | none added |

## Data flow

```text
projectId
  │
  ▼
application-state store (store format 2, schema 1)
  │  readManifest / listSnapshots
  ▼
authoritative snapshot chronology  (snapshotHistory: sequence 1..N, oldest first)
  │
  ▼
committed snapshot reads          (readSnapshot + readEvidence, integrity verified)
  │
  ▼
adjacent deterministic compare    (Kernel diffProjectSnapshots, pair by pair)
  │
  ▼
timeline derivation               (pure: ChangeSet[] -> TimelineEvent[])
  │
  ▼
filters (category, kind) -> pagination (beforeSequence, limit)
  │
  ▼
TimelineResult
```

Every arrow is a read. There is no branch of this flow that writes, locks,
migrates, creates a directory, calls a provider, or opens a socket.

## Event model

A `TimelineEvent` is one sanitized change to one subject, attributed to the
capture that first observed it.

| Field | Meaning |
|---|---|
| `eventId` | deterministic id derived from canonical, domain-separated event inputs |
| `projectId` | the owning project id |
| `snapshotId` | the *current* snapshot of the adjacent pair that produced the event |
| `captureSequence` | that snapshot's contiguous 1-based capture ordinal |
| `eventSequence` | the event's 0-based ordinal within its capture |
| `capturedAt` | that snapshot's authoritative capture timestamp |
| `category` | the existing `ChangeCategory` value |
| `kind` | the existing `StateItemKind` value |
| `subjectId` | the changed item's stable id |
| `title?` | title-level text only, when present |
| `status?` | normalized status label, when present |
| `severity?` | normalized severity label, when present |
| `dueDate?` | timezone-safe due date, when present |
| `evidenceCount` | how many evidence records back the change (a count, never ids) |

A `TimelineEvent` never carries raw evidence, evidence ids, unrestricted
previous/current values, file paths, application-data paths, provider results,
environment values, or any project document content.

The taxonomy is **exactly** the existing ChangeSet taxonomy — the twelve
`ChangeCategory` values and the six `StateItemKind` values. v0.4 introduces no
second taxonomy.

## Ordering

Ordering is total and deterministic:

1. `captureSequence` ascending — the authoritative capture chronology from the
   store manifest's `snapshotHistory`, never a lexical snapshot-id order and
   never a timestamp comparison while a capture sequence exists;
2. then `eventSequence` ascending — the order the Kernel diff emitted the
   changes within that capture, which is itself already deterministic
   (`(item-kind rank, item id, category rank)`).

Two captures may share a `capturedAt` timestamp; their distinct
`captureSequence` values still order them exactly. `capturedAt` is presentation
data, never a sort key.

## Query model

```text
projectId        required
limit            optional, default 20, min 1, max 100
beforeSequence   optional, non-negative integer
category         optional, one ChangeCategory value
kind             optional, one StateItemKind value
```

Semantics:

- the result is the **newest-first** page of the timeline;
- `beforeSequence` is an exclusive upper bound on `captureSequence`: only events
  with `captureSequence < beforeSequence` are eligible;
- `category` and `kind` filter independently and combine as a conjunction;
- **filtering is applied before the limit is taken**, so a page is never short
  because filtered-out events consumed its budget.

## Pagination model

Pagination is by capture boundary, so a page never splits a capture:

- eligible events are filtered, then grouped by `captureSequence`;
- captures are consumed newest-first, whole, until adding the next capture would
  exceed `limit`;
- at least one capture is always returned when any eligible event exists, even if
  that single capture's event count exceeds `limit` — a truthful over-limit page
  beats silently dropping events inside a capture;
- `hasMore` is `true` exactly when at least one eligible event remains below the
  returned page;
- `nextBeforeSequence` is present exactly when `hasMore` is `true`, and equals
  the lowest `captureSequence` in the returned page — so passing it back yields
  the next page with no duplicate and no skip.

Repeating a query with the same store and the same inputs returns a
byte-identical result.

## Privacy allowlist

The allowlist is the `TimelineEvent` field list above, and nothing else. It is
enforced at three independent layers:

1. **derivation** — the pure layer constructs events from allowlisted fields
   only; it has no access to raw evidence or document content;
2. **projection** — the MCP tool re-validates its output against a `strict()`
   schema and rejects rather than partially emits;
3. **scan** — the serialized MCP output passes the existing forbidden-marker scan
   before it is returned.

## Corruption behavior

Timeline reads **fail closed**. There is no partial timeline.

| Condition | Behavior |
|---|---|
| malformed query | controlled validation failure |
| unknown project | the existing `noPriorMemory` convention — an empty, valid result |
| manifest missing a referenced snapshot | fail closed |
| corrupt manifest | fail closed |
| corrupt snapshot or evidence | fail closed |
| integrity mismatch | fail closed |
| unsupported store format | fail closed, never migrate |
| store format 1 (migration required) | fail closed, never migrate |
| concurrent capture during a read | committed-manifest semantics only; a partial transaction is never observable |

Zero snapshots and exactly one snapshot both return an **empty valid timeline**,
not a failure: there is simply no adjacent pair to compare.

## Compatibility with v0.3.1

| Invariant | v0.3.1 | v0.4.0 |
|---|---|---|
| Project Brain schema | 1 | **1** |
| Store format | 2 | **2** |
| Store migration required | no | **no** |
| Memory subcommands | 6 | **7** |
| MCP tools (installed) | 11 | **12** |
| MCP write tools | 0 | **0** |
| MCP transport | stdio | **stdio** |
| Installed runtime | Node.js 20+ | **Node.js 20+** |
| Packages | private | **private** |
| Registry publication | none | **none** |

A Project Brain store created by the public `v0.3.1` build is read directly by
`v0.4.0` with no migration and no repair. The six existing memory subcommands
(`capture`, `changes`, `status`, `history`, `export`, `delete`) and the eleven
existing MCP tools keep their exact names, options, output shapes, ordering and
exit codes.

## CLI surface

```text
oh-my-pm memory timeline
  --project-id <id>       required
  --data-dir <path>       optional
  --limit <1-100>         optional, default 20
  --before-sequence <n>   optional
  --category <value>      optional
  --kind <value>          optional
  --json | --markdown     optional (brief is the default, as for every command)
  --help | -h
```

Behavior: read-only, exit `0` on success, exit `2` on a usage error (the existing
convention), stdout-only on success, one trailing newline, deterministic across
repeated runs. No `--apply` exists. No project root is required. No clock,
token, environment, or network read occurs. No application-state directory is
created on a read.

## MCP surface

One new tool, `project_timeline`, appended after the existing eleven. Input is
`projectId` plus the optional `limit`, `beforeSequence`, `category`, `kind`. The
memory dependency is lazy-loaded on this tool's path only, exactly as
`project_changes` does, so a bundle without `@oh-my-pm/project-memory` keeps its
smaller tool surface rather than failing to start.

Final counts: **twelve** tools, **zero** write tools, **stdio** only.

## Validation gates

| Gate | Evidence |
|---|---|
| G1 contracts | valid/invalid, unknown-field, oversize, TS/Rust fixture parity |
| G2 determinism | byte-identical repeated derivation; deterministic ids and order |
| G3 boundary purity | the derivation layer reads no clock/fs/env/network/random/provider |
| G4 pagination | no duplicate, no skip, truthful `hasMore`/`nextBeforeSequence` |
| G5 runtime read-only | zero writes, zero directory creation, zero provider calls |
| G6 CLI | help, exit codes, stdout/stderr split, filters, pagination, determinism |
| G7 MCP | fixed tool order, strict schema, sanitized output, forbidden-field absence |
| G8 compatibility | a v0.3.1 store works under v0.4.0 with no migration |
| G9 failure safety | every corruption condition fails closed with no partial output |
| G10 installed matrix | Ubuntu/macOS/Windows `.tar.gz` + `.zip` qualification |
| G11 privacy | allowlist enforced at derivation, projection, and scan |
| G12 release truthfulness | profile, docs, and counts match the shipped artifact |

## Release invariants

```text
release line:            v0.4
profile:                 project-brain-timeline
version:                 0.4.0
Project Brain schema:    1
store format:            2
memory subcommands:      7
MCP tools:               12
MCP write tools:         0
Node.js:                 20+
packages:                private
registry publication:    none
```

`v0.3.1` (`81d869e`) remains the immutable base stable tag and is never moved or
recreated.
