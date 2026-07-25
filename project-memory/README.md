# @oh-my-pm/project-memory

Private local persistence adapter for the OH MY PM Project Brain (v0.3 Phase 2).

This package is the explicit **application-state write boundary**. It stores
minimized, immutable Project Brain snapshot and evidence records — already
finalized by the Phase 1 Kernel — in a local application-data location that is
**never** inside the analyzed project. It does not analyze, normalize,
fingerprint semantically, or diff those records; it only persists, verifies,
reads, exports, and deletes them.

It is **not** wired into any public CLI command, MCP tool, Runtime path, or the
v0.2 release bundle. Nothing invokes it yet. It exists as a standalone,
dependency-free package precisely because persistence is a new I/O boundary that
must not be hidden inside the pure Kernel, Runtime, Skills, or Providers.

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
  errors with sanitized recovery hints.

## Boundary

`node-adapter.ts` is the only module that performs real filesystem I/O. The
store (`store.ts`) is dependency-injected against an abstract `FileSystem` port
and imports no `node:fs`, so the write boundary is a single, auditable file.

See [`docs/v0.3/phase-2-persistence.md`](../docs/v0.3/phase-2-persistence.md)
for the full design, on-disk layout, and acceptance evidence.
