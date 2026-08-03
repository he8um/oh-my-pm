# @oh-my-pm/project-memory

Private local persistence adapter for the OH MY PM Project Brain.

This package is the explicit **application-state write boundary**. It stores
minimized, immutable Project Brain snapshot and evidence records — already
finalized by the Kernel — in a local application-data location that is **never**
inside the analyzed project. It does not analyze, normalize, fingerprint
semantically, or diff those records; it only persists, verifies, reads, exports,
and deletes them.

It is a standalone, dependency-free package precisely because persistence is an
I/O boundary that must not be hidden inside the pure Kernel, Runtime, Skills, or
Providers.

## Who invokes it

Shipped since v0.3.0, and packaged in the current release bundle. It is reached
**only** through the application layer's memory orchestrator
([`@oh-my-pm/application`](../application/README.md)), which loads it via a lazy
dynamic import so a profile without Project Memory still starts:

| Surface | Entry points                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| CLI     | the seven `omp memory` subcommands: `capture`, `changes`, `status`, `history`, `export`, `delete`, `timeline` |
| MCP     | the read-only `project_changes` and `project_timeline` tools                                                  |
| Runtime | the Project Brain Runtime API (`createProjectBrainRuntime`) via the structural port                           |

No package takes a production dependency on it except the application layer,
CLI, and MCP server; the Runtime reaches it only through a structural port, and
`tools/validate-boundaries.mjs` enforces both rules.

**Store format 2. Project Brain schema 1.** Neither changed in v0.5.1, and no
migration is required.

## Guarantees

- **No external dependency.** Node.js 20 built-ins only.
- **No network, no telemetry.** Purely local filesystem I/O.
- **No project-file writes.** Every managed path is confined below a resolved
  application-data root that is separated from, and never nested with, the
  project root.
- **Atomic writes.** Same-filesystem temp-then-rename; the manifest rename is the
  commit point. A crash before it leaves the old store authoritative; after it,
  the new store.
- **Integrity everywhere.** Domain-separated SHA-256 over canonicalized bodies
  for the manifest, each immutable record, and export inventories.
- **Single-writer locking.** Exclusive lock create; a lock is stale only when it
  is both old and owned by a dead process. Reads never lock.
- **Data minimization.** Payloads whose object keys normalize to a secret- or
  raw-content-bearing name are refused before a single byte is written.
- **Safe reads.** No auto-repair, no orphan adoption, controlled corruption
  errors with sanitized recovery hints. A read never mutates, never quarantines,
  and never migrates.
- **Explicit recovery.** Corruption is repaired only through the preview-first
  path (`scanStore` -> `buildRepairPlan` -> `applyRepairPlan`, surfaced as
  `omp memory repair`). The scan and plan are strictly read-only; apply requires
  explicit intent, holds the writer lock, re-scans under it, and refuses a plan
  whose store fingerprint moved. Authoritative bytes are **isolated** into
  quarantine with their exact contents preserved, never rewritten from a guess and
  never deleted; only derived state is rebuilt, and only from records that verify.
  Quarantine is recovery evidence, not live state: it is excluded from record
  discovery and chronology, and is never automatically pruned.

## Boundary

`node-adapter.ts` is the only module that performs real filesystem I/O. The
store (`store.ts`) is dependency-injected against an abstract `FileSystem` port
and imports no `node:fs`, so the write boundary is a single, auditable file.

See [`docs/v0.3/phase-2-persistence.md`](../docs/v0.3/phase-2-persistence.md)
for the full design, on-disk layout, and acceptance evidence.
