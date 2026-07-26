# v0.3 Phase 5 — Minimal Read-Only MCP Projection: `project_changes`

## Status

**Implemented and green.** Phase 5 adds exactly one bounded, sanitized,
read-only MCP tool — `project_changes` — over already-captured Project Brain
memory. It reads local application-state memory and compares committed snapshots
in authoritative capture order (Phase 4.1). It does not capture a project,
inspect project files, call a provider, migrate a store, export, delete, repair,
or write anything. The source/workspace capability server exposes **eleven**
tools (the historical ten plus `project_changes`); the legacy/current v0.2
bundle — which excludes `@oh-my-pm/project-memory` — starts with the exact
**ten** tools. The published immutable `v0.2.0` artifact and its historical
ten-tool surface are unchanged. `version.json` stays `0.2.0`, the Project Brain
schema stays `1`, the Project Memory store format stays `2`, and MCP remains
stdio-only. Phase 6 is not started.

## Authorized Scope

Phase 5 adds:

- exactly one new read-only MCP tool: `project_changes`;
- its types, strict projector, read-only runner, and lazy optional capability
  loader under `mcp-server/src/**`;
- conditional registration in the server (appended after the existing ten, only
  when a read-only executor is injected);
- lazy optional Project Memory capability loading at stdio startup;
- a source/workspace stdio smoke for the eleventh tool;
- narrow tool-count verifier and architecture-guard updates;
- this Phase 5 report.

Explicitly out of scope and **not** implemented: any MCP write tool;
`project_capture` / `project_delete` / `project_export` / `project_migrate` /
`project_status` / `project_history`; a second Project Brain MCP tool; HTTP/SSE/
WebSocket transport; provider calls; network access; project-file reads/writes;
application-state writes; lock acquisition; automatic migration; migration
preview/apply; export/delete/repair/prune/import; agent-supplied data-directory
or project-root paths; raw `ProjectState`/`EvidenceRecord` output; raw
`previousValue`/`currentValue`; evidence bodies or evidence ids; Runtime/Kernel/
Skills/Provider/CLI/Project Memory semantic changes; contract or store-format
changes; external dependencies; telemetry; a version bump; a tag/release; and
Phase 6 (release qualification).

## Decision to Add One Tool

The deliberate decision is **one** tool, not the zero-tool Phase 5 outcome and
not more than one. `project_changes` is the smallest useful read-only projection
of the Phase 3 compare over Phase 4.1 chronology: it answers "what changed
between the last two captures" without exposing raw state, evidence, or paths.

## Tool Contract

`project_changes` reads already-captured local Project Brain memory and compares
snapshots in authoritative capture order. Its description states plainly that it
does not capture or modify a project, does not migrate/export/delete/repair
memory, and performs no network request. It carries the annotations
`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`,
`openWorldHint: false`.

## Input Schema

A strict input with no path, token, provider, or mutation field:

```ts
type McpProjectChangesInput = {
  projectId: string;              // trimmed, 1..256 bytes, no control chars,
                                  // not "."/".."/slash/backslash/absolute-like
  previousSnapshotId?: string;    // both-or-neither, must differ, bounded
  currentSnapshotId?: string;
  staleAfterSeconds?: number;     // 0..31536000, default 604800, integer
  limit?: number;                 // 1..100, default 50, integer; bounds output only
};
```

There is no `root`, `projectRoot`, `dataDir`, `path`, `configPath`, `token`,
`authorization`, `repository`, `provider`, `capture`, `apply`, `confirm`,
`migrate`, `force`, `raw`, or `includeBodies` field. The agent cannot choose a
filesystem location; unknown fields have no effect and never reach the runner.
`limit` bounds MCP projection output only — it never alters Kernel comparison
semantics.

## Output Projection

A strict, versioned result:

```ts
type McpProjectChangesResult = {
  schemaVersion: 1;
  status: "compared" | "noPriorMemory" | "insufficientHistory";
  projectId: string;
  previousSnapshotId?: string;
  currentSnapshotId?: string;
  chronology: "capture-order";
  summary: {
    totalChanges: number;
    returnedChanges: number;
    truncated: boolean;
    countsByCategory: Record<ChangeCategory, number>; // all twelve, complete
  };
  changes: McpProjectedChange[];
};
```

Each projected change is a strict allowlist — `category`, `itemKind`, `itemId`,
optional `title`/`previousStatus`/`currentStatus`/`previousSeverity`/
`currentSeverity`/`previousDueDate`/`currentDueDate`, and `evidenceCount`. The
projector inspects the Kernel `StateChange.previousValue`/`currentValue` only to
extract those allowlisted scalars.

`noPriorMemory` and `insufficientHistory` are controlled success statuses (not
errors) with an empty `changes` array and zeroed summary.

## Sanitization

The projection never exposes `previousValue`, `currentValue`, `evidenceRefs`,
`EvidenceRecord`, `ProjectState`, `ProjectSnapshot`, `metadata`, `provenance`,
`owner`, `priority`, raw bodies, Markdown, GitHub bodies, diff/diffHunk, a
Runtime trace, the memory manifest, filesystem paths, integrity envelopes, a
local salt, or a root token. **Evidence ids are never public output — only
`evidenceCount` is exposed.** Optional display fields are omitted when they carry
control characters, exceed their byte bound, look like an absolute path, or match
a planted secret sentinel; ordinary title text is never rejected merely for
containing a word such as "token". The server re-validates the projected result
against a strict Zod schema and scans the serialized output for structural leak
markers before returning; a failure yields `project_changes_output_invalid`
rather than partial data.

## Bounds

Centralized projection bounds: project/snapshot/item ids ≤ 256 bytes, title ≤
512, status ≤ 128, severity ≤ 64, due date ≤ 64, and at most 100 returned
changes. Required identifiers are never silently truncated (an unsafe one drops
its change); optional display fields are omitted when unsafe. The `changes`
array is bounded by the input `limit`; `truncated` is `true` when
`totalChanges > returnedChanges`. No structured collection is truncated beyond
the explicit limit, and the category counts always cover the full ChangeSet.

## Chronology

The default comparison compares the latest committed capture with the capture
committed immediately before it, using the memory port's Phase 4.1 capture
chronology (`listSnapshots`, oldest first) — never a lexical id order. An
explicit `previousSnapshotId`/`currentSnapshotId` pair is honored exactly. The
`changes` array preserves the exact Kernel ChangeSet order and is never reordered
by category for presentation.

## Read-Only Execution

The runner validates input defensively, resolves the STANDARD application-data
root (the same one the Project Memory adapter uses — the agent supplies no path),
constructs the existing Node Project Memory adapter, runs the existing Phase 3
Project Brain compare, and projects the result. It supplies inert observation and
deriver ports that fail closed if the compare path ever tried to use them (it
never does for compare). It performs no project-file read, no provider
construction, no Skills call, no capture/commit/export/delete/migrate/repair, no
lock, no data-directory creation, no token read, and no network request. The
Kernel is reached through its existing binding; the diff logic is never
duplicated in MCP.

## Error Model

Controlled store/runtime conditions map to stable public codes with concise,
sanitized recovery hints:

- no prior memory → success status (capture through the CLI first);
- insufficient history → success status (capture at least twice);
- migration required → `project_changes_migration_required` (run
  `memory capture --migrate-store` in the CLI);
- corruption → `project_changes_store_corrupt` / `project_changes_read_failed`
  (inspect memory through the CLI);
- unsupported newer store → `project_changes_unsupported_store` (upgrade OH MY
  PM);
- incompatible schema → `project_changes_incompatible_schema`;
- kernel unavailable → `project_changes_kernel_unavailable`.

An unexpected executor exception maps to one generic
`project_changes_failed: unexpected project changes failure`. The tool never
triggers the suggested recovery action itself, and errors never expose an
exception message, stack, path, payload, or trace.

## Lazy Capability Loading

Neither `server.ts`, `index.ts`, nor the MCP bin statically imports
`@oh-my-pm/project-memory`. An async optional loader, used only by stdio startup,
probes the package via a dynamic import: when it resolves (source/workspace) the
loader returns a default executor and the server registers `project_changes`;
when it is absent (the legacy/current v0.2 bundle) the loader returns `undefined`
and the server preserves its exact ten-tool surface. `createOhMyPmMcpServer()`
stays synchronous and registers `project_changes` only when an executor is
passed. No stderr warning is emitted when Project Memory is absent — the ten-tool
fallback is intentional compatibility behavior. `@oh-my-pm/project-memory` is a
dev/build-time workspace dependency of the MCP package (so TypeScript resolves
the lazily imported path) and stays excluded from the v0.2 release bundle.

## Source vs Legacy Bundle Tool Counts

```text
source/workspace with Project Memory available -> eleven tools
legacy/current v0.2 bundle without Project Memory -> existing ten tools
published v0.2.0 -> unchanged (ten tools)
```

Constants: `LEGACY_V02_MCP_TOOL_COUNT = 10`,
`SOURCE_V03_PHASE5_MCP_TOOL_COUNT = 11`,
`PROJECT_BRAIN_MCP_WRITE_TOOL_COUNT = 0`,
`PROJECT_BRAIN_MCP_READ_TOOL_COUNT = 1`.

## Stdio-Only Transport

The transport remains the official MCP stdio transport. Phase 5 adds no HTTP,
SSE, WebSocket, or remote transport, and no server framework.

## Privacy

The real clock is supplied only at the process boundary (the bin); the server,
projector, and runtime never read a system clock. The runner reads the injected
clock exactly once per invocation and never while listing tools. The resolved
data-root path never appears in MCP text content, structured content, errors,
logs, stderr, or traces. Tests plant unique secret sentinels and scan the tool
output; production output bans structural leak markers, never ordinary words.

## Tests

- `mcp-server/test/project-changes-projector.test.ts` — all twelve categories,
  allowlist extraction, omission/rejection of unsafe/forbidden fields, complete
  counts, preserved Kernel order, bounds/truncation, Markdown escaping, and the
  leak-marker scanner (17 tests).
- `mcp-server/test/project-changes-runner.test.ts` — no prior memory, insufficient
  history, real two-capture compare, four-capture immediate-predecessor
  chronology, explicit pair, limit-bounds-only, determinism under a fixed clock,
  clock read exactly once, read-only guarantees (no write/lock/staging/backup/
  data-dir), input validation, and version/corruption mappings including a real
  store-format-1 store that blocks compare without migrating (17 tests).
- `mcp-server/test/project-changes-server.test.ts` — ten tools without an executor,
  eleven with one, exact order with `project_changes` last, read-only
  annotations, no second Project Brain tool, sanitized result, failure mapping,
  output-invalid rejection, ignored unknown fields, and no forbidden leak
  (10 tests).
- `tools/check-mcp-server.mjs` — the source/workspace stdio smoke asserts eleven
  tools, calls `project_brief`, `provider_status`, and `project_changes` (against
  an isolated empty standard data root), asserts `noPriorMemory`, asserts no data
  directory/file/lock was created, scans for forbidden sentinels, and closes with
  empty stderr and no network request.
- The existing release-bundle/install regression proves the legacy/current v0.2
  bundle starts the MCP server with the existing ten tools (Project Memory
  absent), and that the existing tools still work.

## Acceptance G12

- exactly one new read-only Project Brain tool; zero MCP write tools;
- bounded, strict output with no raw bodies, tokens, or absolute paths;
- stdio only; no network; no write/lock/migration.

Chronology: the default pair uses Phase 4.1 capture chronology with no lexical
fallback; the explicit pair remains exact. Source capability: the source/
workspace stdio server exposes and executes `project_changes`. Legacy
compatibility: the legacy/current v0.2 bundle starts with ten tools, existing
tools work, Project Memory absence causes no startup failure, and published
`v0.2.0` is untouched. Architecture: Runtime/Kernel/Skills/Providers/CLI/Project
Memory semantics are unchanged and the source version remains `0.2.0`.

`G1–G11` preserved; `G12` green; `G13` not complete (installed cross-platform
qualification of `project_changes` belongs to Phase 6); `G14` published v0.2 is
unaffected. This is not a claim of v0.3 release readiness.

## Release Qualification Deferral

Installed-artifact enablement and cross-platform qualification of
`project_changes` — packaging `@oh-my-pm/project-memory` into a release bundle so
the installed MCP server exposes the tool — is deferred to Phase 6. Phase 5 makes
no release-format or distribution change beyond the test-only expectation that
distinguishes the source/workspace capability server (eleven) from the legacy
bundle (ten).

## Explicit Non-Implementation of Phase 6

Phase 6 (release qualification and the deliberate RC decision) is **not started**
and requires a separate, explicit approval.
