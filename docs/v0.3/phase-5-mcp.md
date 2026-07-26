# v0.3 Phase 5 — Minimal Read-Only MCP Projection

## Status

Implemented in source/workspace. The source version remains `0.2.0`; Phase 6
has not started and no release artifact is changed.

## Authorized Scope

Phase 5 adds exactly one Project Brain MCP tool, `project_changes`. It exposes a
bounded projection of already-captured local memory. There are zero Project
Brain MCP write tools.

## Decision to Add One Tool

The one-tool option was selected instead of the permitted zero-tool outcome
because Phase 3 comparison semantics and Phase 4.1 capture chronology are
stable. A second Project Brain tool is outside the authorized interface budget.

## Tool Contract

`project_changes` is registered after the existing ten tools only when a
read-only executor is supplied. It never captures a project, reads live project
files, calls a provider, or changes memory.

## Input Schema

The strict input accepts `projectId`, an optional complete and unequal
`previousSnapshotId`/`currentSnapshotId` pair, `staleAfterSeconds` (`0..31536000`,
default `604800`), and `limit` (`1..100`, default `50`). Unknown fields are
rejected. There is no project-root, data-root, token, network, apply, migration,
or raw-output input.

## Output Projection

Schema version 1 returns `compared`, `noPriorMemory`, or
`insufficientHistory`, the capture-order chronology marker, complete counts for
all twelve Kernel categories, total/returned/truncated counts, and a bounded
ordered prefix of changes. Each change contains only category, kind, id,
allowlisted title/status/severity/due-date scalars, and an evidence count.

## Sanitization

Raw previous/current values, evidence identifiers, bodies, metadata,
provenance, owners, paths, traces, manifests, and integrity data are never
projected. Required identifiers fail closed. Unsafe optional strings are
omitted.

## Bounds

Project and snapshot ids are limited to 256 UTF-8 bytes; item ids to 256,
titles to 512, status to 128, severity to 64, and due dates to 64. At most 100
changes are returned.

## Chronology

Default comparison uses the Phase 4.1 authoritative `listSnapshots` capture
order: current is the latest capture and previous is its immediate predecessor.
There is no lexical fallback. An explicit valid pair is compared exactly.

## Read-Only Execution

The runner resolves only the standard OH MY PM application-data root, composes
the existing Project Memory read API, Phase 3 Runtime compare API, and Phase 1
Kernel binding, and injects one caller clock value. It performs no write, lock,
migration, repair, export, delete, provider, network, or project-file operation.

## Error Model

No memory and one-snapshot history are controlled successes. Store corruption,
migration-required, unsupported-newer stores, incompatible schemas, unavailable
Kernel, read failures, and unexpected exceptions map to concise stable errors
without causes, paths, payloads, or stacks. The tool never performs a suggested
recovery action.

## Lazy Capability Loading

The synchronous server constructor has no Project Memory import and preserves
the ten-tool default. Stdio startup dynamically loads the Phase 5 runner.
Absence of Project Memory in the legacy v0.2 bundle intentionally disables only
`project_changes` without warning or startup failure.

The legacy portable entrypoint calls stdio startup without source capability
options; that path skips the optional loader entirely and retains the exact
ten-tool v0.2 surface. Source/workspace startup supplies the caller clock and
loads the conditional capability.

## Source vs Legacy Bundle Tool Counts

- source/workspace capability server: 11 tools;
- legacy/current v0.2 bundle and installed artifact: 10 tools;
- Project Brain MCP read tools: 1;
- Project Brain MCP write tools: 0.

The published `v0.2.0` release remains immutable.

## Stdio-Only Transport

MCP remains local stdio only. No HTTP, SSE, WebSocket, listener, or remote
transport is added.

## Privacy

Both deterministic Markdown and strict structured content use the same bounded
projection. Tests plant secret, body, path, trace, provider, and diff sentinels
and scan both surfaces.

## Tests

Registration, exact ordering, strict inputs, all categories, scalar extraction,
limits, truncation, sanitization, Markdown escaping, controlled errors, clock
cardinality, source stdio, no-memory behavior, and legacy ten-tool fallback are
covered. Runtime, Project Memory, Kernel, structure, boundary, public-surface,
and release-bundle regressions remain separate gates.

## Acceptance G12

G12 is satisfied when focused and full validation confirm exactly one bounded
read-only tool, zero write tools, no bodies/tokens/absolute paths, stdio only,
and zero network/write/lock/migration behavior. G1–G11 are preserved.

## Release Qualification Deferral

G13 is not complete. Installed cross-platform qualification and an RC decision
belong only to a separately authorized Phase 6.

## Explicit Non-Implementation of Phase 6

This phase does not add Project Memory to release packaging, bump a version,
change a release workflow, create a tag, publish an artifact, or claim v0.3
release readiness.
