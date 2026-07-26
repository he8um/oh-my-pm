# v0.3 Phase 2 — Local Project Memory Persistence Adapter

## Status

**Implemented and green.** Phase 2 adds one private, dependency-free persistence
package — `@oh-my-pm/project-memory` — and one explicit Node filesystem adapter
that writes minimized, immutable Project Brain snapshot and evidence records to a
local application-data location that is never inside the analyzed project. It
adds **no** public CLI command, MCP tool, Runtime orchestration, project-file
write, network path, telemetry, or contract/Kernel change. `version.json` remains
`0.2.0`, the MCP surface remains exactly ten tools, and the v0.2 release bundle
inventory is unchanged. Phases 3–6 remain unstarted; each requires a separate,
explicit approval.

## Authorized Scope

Phase 2 implements the persistence adapter groundwork only: the persistence
interface, one Node adapter, application-data path resolution, the finalized
local JSON storage format, atomic writes, manifest/record integrity, immutable
snapshot/evidence records, safe reads and verification, single-writer locking, a
migration mechanism/scaffold, export, delete, tests, guards, and this document.

Explicitly **out of scope** and not implemented: Runtime capture/compare
orchestration; any Skills/Providers/CLI/MCP/Installer/Distribution behavior
change; new CLI commands; new MCP tools; project-file writes; network or
telemetry; cloud storage; SQLite/LevelDB/ORM/native database/daemon/watcher/
queue; contract or Kernel semantic changes; a version bump; a release or tag.

## Package Boundary

The package exists because persistence is a new I/O boundary that must not be
hidden inside the pure Kernel, Runtime, Skills, or Providers.

| Property | Value |
|---|---|
| Path / name | `project-memory/` · `@oh-my-pm/project-memory` |
| private / version | `true` · `0.2.0` |
| Module type | `type: module`, Node.js 20 built-ins only |
| External dependencies | none (empty dependency set enforced by both validators) |
| Release bundle inclusion | none (bundle references an explicit package list) |

`node-adapter.ts` is the **only** module that performs real filesystem I/O. The
store (`store.ts`) is dependency-injected against an abstract `FileSystem` port
and imports no `node:fs`, so the mutating boundary is a single, auditable file.
The resolver wrapper in `node-adapter.ts` is the only place that reads
`process.platform`, `process.env`, and `os.homedir()` — for path resolution only,
never a provider token.

## Storage Format Decision

JSON record files are selected because same-filesystem temp-then-rename is
portable, corruption is isolated per record, records are inspectable/exportable,
and no native dependency is introduced. JSONL is rejected for v1 because a
partially appended final line complicates crash recovery and concurrent-reader
guarantees.

Store format version: **1**. This is separate from the Project Brain schema
version, which is also `1`.

## On-Disk Layout

```
<data-root>/
  project-brain/
    v1/
      locks/
        <project-key>.lock
      projects/
        <project-key>/
          manifest.json
          snapshots/
            <record-key>.json
          evidence/
            <record-key>.json
          staging/
          backups/
```

Project ids and record ids are never used directly as filenames. Keys are
lowercase SHA-256 values. No symlink is allowed inside the managed store. Every
managed path is confined below the resolved data root, with traversal rejected.

Domain separators (all hashed via `node:crypto`, no hash dependency):

```
oh-my-pm:project-memory:v1:project-key
oh-my-pm:project-memory:v1:record-key
oh-my-pm:project-memory:v1:manifest-integrity
oh-my-pm:project-memory:v1:record-integrity
oh-my-pm:project-memory:v1:export-inventory-integrity
```

## Data Location

A pure resolver takes `platform`, `homedir`, an `env` map, and an explicit
override, and returns the application-data root. It performs no I/O.

```
1. explicit override
2. Windows: LOCALAPPDATA/oh-my-pm
3. macOS: HOME/Library/Application Support/oh-my-pm
4. Linux/Unix: XDG_DATA_HOME/oh-my-pm
5. Linux/Unix fallback: HOME/.local/share/oh-my-pm
```

It fails closed when no safe base exists. The resolved absolute data-root path is
never persisted.

## Manifest and Record Envelopes

The internal `ProjectStoreManifest` carries `storeFormatVersion`,
`projectBrainSchemaVersion`, `projectId`, `projectKey`, `createdAt`,
`updatedAt`, `latestSnapshotId`, `snapshotIds`, `evidenceIds`,
`migrationHistory`, and `integrity`. As of the Phase 4.1 chronology correction
the internal store format is **2**; the Project Brain schema stays `1`; the
latest snapshot must exist in `snapshotIds`; timestamps are caller-provided
RFC3339; and no project path, secret, or raw content is stored.

Store format 2 adds an authoritative capture chronology — `snapshotHistory` (an
oldest-first list of `{ snapshotId, capturedAt, sequence }` with a contiguous
`sequence` `1..N`) and `snapshotChronologyOrigin` (`native` or `recoveredV1`) —
both covered by the manifest integrity digest. `snapshotIds` remains a
deterministic, lexically sorted **inventory** (used for inventory / integrity /
export), never the chronology; `latestSnapshotId` must equal the final
`snapshotHistory` entry. `listSnapshots` derives its order exclusively from
`snapshotHistory`. See
[phase-4-1-snapshot-chronology.md](phase-4-1-snapshot-chronology.md).

A v2 manifest may reference immutable record envelopes written under store format
1 or 2 (mixed-envelope compatibility): each envelope is integrity-verified under
its own declared version/shape, an envelope newer than the reader is rejected,
supported older envelopes are accepted, and no record payload is ever rewritten
merely to change chronology.

Each immutable record envelope carries `recordType` (`snapshot`/`evidence`),
`storeFormatVersion`, `projectBrainSchemaVersion`, `projectId`, `recordId`,
`payload`, and `integrity`. Records are immutable: the same id with an identical
verified payload is idempotent; the same id with a different payload is a
conflict. Snapshot/evidence project ids must match, and every snapshot evidence
reference must exist in existing or submitted evidence. Phase 1 semantic
fingerprints are never recomputed in TypeScript.

## Integrity

A dependency-free canonical JSON serializer (UTF-8, lexicographically sorted
object keys, array order preserved, no insignificant whitespace, finite numbers
only, no `undefined`, bounded output) is used **only** for manifest integrity,
record integrity, and export inventory integrity. It is not a replacement for
Kernel canonicalization. Integrity is `sha256:<64 lowercase hex>`. Golden
integrity hashes are pinned in tests.

## Atomic Commit

Same-filesystem staging:

```
1. validate complete input before writing
2. acquire project lock
3. read and verify existing manifest
4. create staging directory under the project store
5. write record envelopes to staging
6. fsync staged files
7. move new immutable records to final paths
8. build next manifest in memory
9. write manifest.json.tmp
10. fsync the temp manifest
11. atomically rename it to manifest.json   ← commit point
12. fsync the parent directory where supported
13. remove staging
14. release lock in finally
```

Failure before the manifest rename leaves the old store authoritative; failure
after it leaves the new store authoritative. Readers never accept a partial
manifest. Abandoned staging is reported by `inspect`, never silently adopted. No
record is ever overwritten. Temporary names derive from a validated
`operationId` plus PID — never from project content. Test-only failure injection
covers `afterLock`, `afterStagingCreated`, `afterFirstRecordWritten`,
`afterRecordsMoved`, `beforeManifestRename`, `afterManifestRename`, and
`beforeCleanup`.

## Locking

The lock lives at `<data-root>/project-brain/v1/locks/<project-key>.lock`,
acquired with an exclusive create (`open(..., "wx")`). Its content is
`lockVersion`, `projectKey`, `operationId`, `pid`, `createdAt` — no project path
or content. A lock is **stale only when its age exceeds the threshold AND its
owning process is not alive**; the reference time and liveness probe are injected
for tests. Reads never lock. There is no daemon or background cleanup.

## Safe Reads

Reads perform no writes, acquire no write lock, parse bounded JSON, verify
manifest and requested-record integrity, verify ids/record type/project
ownership, reject missing referenced records, and reject an unsupported newer
store format — returning controlled corruption errors with sanitized recovery
hints. There is no auto-repair, no orphan adoption, and no staging auto-delete.
`inspect` reports abandoned staging, unreferenced records, missing records,
integrity failures, and unsupported format.

## Corruption

Malformed JSON, a missing record, a wrong project/id/type, an invalid latest
snapshot, or a tampered payload all fail safely with a stable error code. A
symlink inside a record directory is reported as an integrity issue and never
followed.

## Migration

Migrations are ordered one-version steps under the project lock: the source is
verified, a backup is taken (never auto-deleted), the target is committed
atomically, the target is verified, and completed steps are recorded in the
manifest history. As of Phase 4.1, `CURRENT_STORE_FORMAT_VERSION = 2` and
`SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION = 1`. Behavior: a missing store means no
prior memory; version 2 is supported; version > 2 is unsupported-newer; version
< 2 requires migration; a schema version != 1 is incompatible. One real
**production** migration `1 → 2` is registered (wired into the Node adapter's
default registry); it recovers the best deterministic capture chronology a v1
store can yield — see
[phase-4-1-snapshot-chronology.md](phase-4-1-snapshot-chronology.md). The
mechanism is additionally exercised by a synthetic, test-only `0 → 1` step
(format 0 is a test-only, never-released format). Migration never runs
automatically during a read.

## Export

Export writes an explicit directory (not ZIP/TAR): it verifies the source store,
rejects a destination inside the project root or the active project store, writes
to a temporary sibling destination, copies only manifest-referenced committed
records (excluding locks, staging, and unreferenced files), writes an
`export-manifest.json` with a deterministic inventory and integrity, fsyncs,
atomically renames the temporary export to the final destination, verifies the
exported copy, and leaves the source unchanged. Import is not implemented.

## Delete

Delete requires `projectId`, `projectRootBoundary`, `operationId`, and a
`confirmation` exactly equal to `projectId`. It acquires the project lock,
verifies the store unless `forceCorruptDelete` is set (defaults false), renames
the project directory to a sibling tombstone, removes the tombstone recursively,
and releases the lock. A missing store is a controlled no-op. It never deletes
another project, the app-data root, or any analyzed project file.

## Privacy

Records must already be minimized by the Phase 1 Kernel; a defense-in-depth guard
rejects any payload whose object keys normalize to a forbidden secret- or
raw-content-bearing name (`token`, `authorization`, `rawbody`, `body`, `diff`,
`absolutepath`, `projectroot`, …) before a single byte is written. Written
records may contain fingerprints, opaque ids, title-level state, allow-listed
metadata/provenance, timestamps, and coverage information; they must not contain
raw Markdown documents, raw GitHub bodies, tokens/headers, or absolute project
paths. A test plants a fake token and proves it never appears in any written
byte, and proves the project-root boundary is never persisted. On POSIX,
directories are `0700` and files are `0600`. On Windows, mode bits are not
meaningful; the store relies on the user's local app-data directory and its ACLs.

## Limits

```
MAX_MANIFEST_BYTES = 4 MiB
MAX_RECORD_BYTES = 16 MiB
MAX_EVIDENCE_PER_COMMIT = 10_000
MAX_SNAPSHOTS_PER_PROJECT = 10_000
MAX_EVIDENCE_PER_PROJECT = 100_000
MAX_OPERATION_ID_BYTES = 128
MAX_EXPORT_BYTES = 2 GiB
```

The adapter rejects rather than truncates, and does not auto-prune history in
Phase 2.

## Controlled Errors

Stable internal codes: `OMP-MEM-1001` invalid input, `1002` path escape/project
collision, `1003` store locked, `1004` corruption, `1005` integrity mismatch,
`1006` unsupported store version, `1007` migration required, `1008` record
conflict, `1009` missing referenced record, `1010` limit exceeded, `1011` atomic
commit failure, `1012` export conflict, `1013` delete confirmation mismatch.
Errors never expose tokens, payloads, raw content, or full project paths.

## Tests

Focused package tests cover: the resolver and path safety (override, Windows,
macOS, Linux/XDG, Linux fallback, missing base, project/data separation,
traversal/symlink rejection, ids-never-filenames, Windows-invalid characters);
integrity and format (golden manifest/record hashes, canonical key ordering,
round-trip, payload/manifest tamper, newer-version refusal); atomicity (first
commit, idempotent repeat, conflicting same id, every failure-injection point,
old/new commit-point behavior, abandoned staging reporting); concurrency (same
project serialized, live lock preserved, stale dead lock reclaimed, different
projects independent, reads never lock); corruption (malformed JSON, missing
record, wrong project, wrong id/type, invalid latest snapshot, no auto-repair,
symlink); privacy (fake token absent, absolute path absent, raw body key
rejected, minimized evidence persists, project directory byte-identical); export
and delete (verified complete export, committed records only, destination
collision/root guard, source unchanged, confirmation, corrupt-store default
refusal, explicit corrupt delete, other projects untouched); and migration
(synthetic 0→1 success, backup created, injected failure preserves original,
migration never automatic). The Node adapter is exercised against a real
temporary filesystem outside the repository, proving the analyzed project stays
byte-identical and POSIX modes are applied. Total: **89 package tests**.

## Acceptance

- **G6 (groundwork only):** the adapter and its interface exist; no explicit CLI
  command yet.
- **G7:** adapter-level export/delete proven.
- **G8:** the migration mechanism is proven with a synthetic test-only migration.
- **G9:** corruption fails safely.
- **G10:** concurrent writes are controlled.
- **G11:** no credentials, network, or telemetry.
- **G14:** v0.2 is unaffected (version, MCP ten-tool surface, release bundle, and
  install checks unchanged).

## Non-Implementation of Phases 3–6

Phase 3 (provider-independent Runtime capture/compare orchestration) is **not
started**. No Runtime, Skills, CLI, MCP, Installer, Provider, or Distribution
behavior changed. The application-state adapter exists but no public command or
tool invokes it. The Project Brain remains user-inaccessible. `version.json`
remains `0.2.0`. Each of Phases 3–6 requires a separate, explicit approval.
