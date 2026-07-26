# v0.3 Phase 4 — Minimal Preview-First CLI Memory Surface

## Status

**Implemented and green.** Phase 4 exposes the already-implemented Project Brain
vertical slice through the existing CLI as one new top-level command namespace,
`memory`, with exactly six subcommands: `capture`, `changes`, `status`,
`history`, `export`, and `delete`. Every mutation is preview-first: `capture`,
`export`, and `delete` default to a zero-write preview and mutate only under an
explicit `--apply`, and `delete --apply` additionally requires an exact
`--confirm <project-id>`. The surface is non-interactive, scriptable, bounded,
sanitized, offline for the local Markdown workflow, and supports `--json` and
`--markdown`. It adds **no** MCP tool or change, **no** new provider, **no**
GitHub capture, **no** Runtime/Skills/Kernel/Project-Memory semantic change,
**no** project-file write, and **no** automatic project-config write. The Project
Memory adapter is loaded lazily via a dynamic import on the memory path only, so
legacy offline commands never resolve it. `version.json` remains `0.2.0`, the MCP
surface remains exactly ten tools in its existing order, and the v0.2 release
bundle still excludes `@oh-my-pm/project-memory`. Phases 5–6 remain unstarted;
each requires a separate, explicit approval.

## Authorized Scope

Phase 4 adds:

- exactly one new top-level CLI command namespace: `memory`;
- exactly six `memory` subcommands (above);
- parser/types/process/format/preview modules under `cli/src/**`;
- local Markdown capture through the existing read-only document loader;
- composition of the existing Phase 3 Project Brain Runtime;
- lazy construction of the existing Phase 2 Node Project Memory adapter;
- explicit project-id resolution from a CLI option or read-only project config;
- a CLI-owned preview memory port that performs no writes;
- structured JSON and Markdown output with stable exit codes;
- process-level and source-workspace CLI end-to-end tests.

Explicitly **out of scope** and not implemented: any MCP change or new MCP tool;
HTTP MCP; provider implementation changes or new providers; GitHub capture in the
Phase 4 CLI surface; Runtime/Skills/Kernel semantic changes; Project Brain
contract changes; Project Memory storage-format/integrity/locking/migration
changes; project-file writes; automatic project-config writes; automatic project
id generation; a hidden identity salt; cloud sync; telemetry; external
dependencies; a version bump; release/tag creation; the deferred general `--help`
feature; and any seventh memory subcommand.

## Command Grammar

```
oh-my-pm memory capture  [project-root] [--project-id <id>] [--data-dir <path>] [--locale en|fa] [--apply] [--migrate-store] [--json|--markdown]
oh-my-pm memory changes  [project-root] [--project-id <id>] [--data-dir <path>] [--previous <id> --current <id>] [--stale-after <seconds>] [--json|--markdown]
oh-my-pm memory status   [project-root] [--project-id <id>] [--data-dir <path>] [--json|--markdown]
oh-my-pm memory history  [project-root] [--project-id <id>] [--data-dir <path>] [--limit <N>] [--json|--markdown]
oh-my-pm memory export   [project-root] --destination <path> [--project-id <id>] [--data-dir <path>] [--apply] [--json|--markdown]
oh-my-pm memory delete   [project-root] [--project-id <id>] [--data-dir <path>] [--apply --confirm <id>] [--force-corrupt-delete] [--json|--markdown]
```

The nested parser (`parseMemoryCommand`) is pure: no filesystem, environment,
network, or clock access. Options may appear after the subcommand in any order.
Duplicate options, missing values, control characters, unsupported options,
mutation-only options on read commands, two positional roots, and any subcommand
outside the six-item allowlist are rejected. The one optional positional is the
project root, defaulting to `.`; it is passed through exactly as typed and never
normalized.

## Explicit Project Identity

Phase 4 uses **explicit project identity only**. Resolution order:

1. `--project-id <id>`;
2. the `projectId` field of the read-only project config (`oh-my-pm.config.json`);
3. a controlled usage error.

An id is a trimmed, non-empty, opaque string of 1..256 UTF-8 bytes with no
control characters; it may not be `.` or `..`, contain a slash or backslash, or
look like an absolute path. The CLI never hashes an absolute path without a salt,
never creates or persists a hidden salt, never derives identity from a username,
hostname, repository remote, or environment, never writes a project id into the
config, and never generates a random id. The programmatic Phase 3 API may still
support derived identities; the CLI deliberately does not, to avoid hidden state
and unstable machine-derived identifiers. Existing configs without `projectId`
remain valid for the legacy (non-memory) commands.

## Preview-First Model

`capture`, `export`, and `delete` default to a preview that performs zero
filesystem writes, acquires no lock, and creates no data directory:

- **capture** runs the full read/derive/finalize pipeline through a CLI-owned
  preview memory port whose read methods delegate to the real store but whose
  commit is an in-memory projection. It reports `wouldWrite: false`,
  `wouldCreateSnapshot`, `wouldBeIdempotent`, the project/snapshot ids, both
  fingerprints, item/evidence counts, and coverage. Applying the same unchanged
  input under the same injected clock produces byte-identical ids and
  fingerprints — the preview never writes and rolls back.
- **export** verifies the source, runs pure destination-safety checks, and
  reports a bounded committed inventory summary with `wouldExport: true`.
- **delete** inspects and verifies the store and reports whether a store exists
  and what would be removed, requiring no confirmation.

Only `--apply` mutates. `delete --apply` additionally requires
`--confirm <project-id>` equal to the resolved id exactly, and
`--force-corrupt-delete` is valid only together with `--apply --confirm`. No
interactive prompt is ever shown.

## Capture

`capture` resolves the explicit project id, loads the configured local Markdown
documents through the existing bounded read-only loader (failing when no document
matches), builds a read-only local provider and registry, and composes the Phase
3 Project Brain Runtime with the real WASM Kernel binding, the pure Skills state
deriver, the provider observation adapter, and either the preview memory port
(default) or the real Phase 2 adapter (`--apply`). The single required
observation boundary is `observationId = "local-markdown"`,
`sourceIdentity = "local-markdown"`, `includedScope = "configured-documents"`,
`required = true`. Capture invokes the Phase 3 `capture()` exactly once and never
runs a preview implicitly before an apply. The resolved project root, config
path, document absolute paths, and raw document bodies are never persisted.

## Changes

`changes` composes the Phase 3 Runtime and calls `compare()` with the
process-boundary clock as `comparedAt`, the `--stale-after` value (default
604800s, bounds 0..31536000) as `evidenceStaleAfterSeconds`, and the documented
safe `maxFutureSkewSeconds` default. `--previous`/`--current` must be supplied
together and must differ; omitting them compares the latest committed capture
with the capture committed **immediately before it** in real capture order (the
Phase 4.1 chronology correction — no longer a content-derived ID order). The
Runtime statuses `compared`, `noPriorMemory`, `insufficientHistory`, and `failed`
are preserved; the Kernel `ChangeSet` is never reordered or reclassified. Brief
output summarizes counts while JSON and Markdown preserve the complete bounded
`ChangeSet`. The command is read-only and rejects `--apply`.

## Status

`status` combines `store.inspect(projectId)` with `store.verify(projectId)` when
a store exists, mapping the Phase 2 version state and verification into one of
`noPriorMemory`, `healthy`, `corrupt`, `unsupportedNewer`, `migrationRequired`,
or `incompatibleSchema`. It returns the project id, status, store-format and
Project-Brain schema versions, snapshot and evidence counts, the latest snapshot
id, and a bounded, sanitized list of issue kinds. It never writes, locks,
migrates, repairs, or cleans up, and never prints an absolute path.

## History

`history` reads the verified manifest and returns **newest-capture-first**
presentation records derived from the store's authoritative capture chronology
(the Phase 4.1 correction), bounded by `--limit` (default 20, bounds 1..100).
Each record carries the snapshot id, its `capturedAt`, a 1-based `sequence`, and
an `isLatest` flag; the result also reports the store's `chronologyOrigin`
(`native` or `recoveredV1`). It never returns the full `ProjectState`, evidence
payloads, raw titles, or absolute paths, and never writes or locks.

## Store migration (`--migrate-store`)

A store written before the chronology correction (internal store format 1) must
be migrated to format 2 before a capture. The capture command carries one
capture-only option, `--migrate-store`, used through the existing preview/apply
boundary — no seventh subcommand is added:

- `memory capture --migrate-store` — preview only; reports `wouldMigrateStore`
  and writes nothing (zero writes, zero locks).
- `memory capture --apply --migrate-store` — migrates `1 → 2` exactly once, then
  captures once (reports `storeMigrated`).
- `memory capture --apply` against a v1 store **without** `--migrate-store` exits
  `4` (migration required) and writes nothing.

`--migrate-store` is rejected on every other subcommand. Read-only commands on a
v1 store report `migrationRequired` and never auto-migrate. If migration succeeds
but the capture then fails, the structured output reports the sanitized failure
and `storeMigrated: true`, never implying the capture succeeded. See
[phase-4-1-snapshot-chronology.md](phase-4-1-snapshot-chronology.md).

## Export

Without `--apply`, `export` verifies the source, runs pure destination-safety
checks, computes a bounded committed inventory summary, and performs no
mkdir/copy/rename/fsync. With `--apply`, it invokes the Phase 2 `exportProject`
exactly once, preserving Phase 2 semantics (a directory copy of the committed
records; no ZIP/TAR). The destination is echoed exactly as the user typed it and
is never replaced with a resolved private absolute path. The source store is
unchanged.

## Delete

Without `--apply`, `delete` inspects and verifies the store and reports whether it
exists and what would be removed, performing no rename/remove/lock/write. With
`--apply`, it requires `--confirm <project-id>` equal to the resolved id exactly,
calls Phase 2 `deleteProject` exactly once, passes `forceCorruptDelete` only when
explicitly supplied, preserves Phase 2 tombstone semantics, and reports a
controlled no-op for a missing store. No interactive confirmation prompt is ever
added.

## Output Modes

Every command supports three renderings via dedicated formatters:

- **brief** (default): a concise, stable, human-readable summary with no ANSI.
- **JSON** (`--json`): one newline-terminated object with a stable envelope
  `{ command, ok, mode?, data, warnings }` (or `{ command, ok: false, error }`
  on failure); no ANSI, no raw content, no absolute path.
- **Markdown** (`--markdown`): deterministic headings and compact lists with no
  generated prose beyond fixed templates, newline terminated.

## Exit Codes

```
0  success, including a successful preview and a delete no-op
1  Runtime/adapter/operational failure (including a required-source capture failure)
2  invalid command, option, config, identity, confirmation, or input (including missing documents)
3  no prior memory or insufficient history
4  store locked, corrupt, migration required, incompatible, or unsupported newer
```

Errors go to stderr; successful structured results go to stdout; JSON/Markdown
error output follows the selected mode; no partial stdout is emitted before a
failed mutating operation.

## Clock and Operation-Id Boundary

The real clock is read only at the bin wrapper and injected into the process
runner. It is consumed at most once per memory invocation, at most once per live
GitHub invocation, and never for legacy offline commands. Production operation
ids are derived at the process boundary from the subcommand, the injected
timestamp, and the process id — no randomness, no project content, bounded, never
displayed, and never persisted in Project Brain payloads. The parser, formatter,
Runtime, Skills, Kernel, and Project Memory never call `Date.now()` or
`new Date()`.

## Privacy

The CLI never modifies the analyzed project. It never persists or prints the
resolved project root, config path, document absolute paths, or raw document
bodies; never persists a token or any credential; and never prints a resolved
data-root path. A user-typed relative root or destination may be echoed exactly
as typed. Stored and exported bytes carry only minimized evidence fingerprints,
derived titles, ids, allow-listed metadata, timestamps, and coverage — the same
minimization the Phase 2/3 layers already enforce.

## Source-Workspace Qualification

Phase 4 is qualified at the source/workspace level: the real built CLI runs as a
child process from a temporary workspace fixture against a temporary data
directory, using the real parser/process, the real local Markdown loader and
provider, the real Phase 3 Runtime, the real WASM Kernel, and the real Phase 2
Node adapter. The end-to-end journey defines an explicit `projectId`, previews a
capture (proving no memory directory is created), applies it, edits the Markdown,
applies a second capture, inspects status and history, compares, previews and
applies an export, and previews and applies a confirmed delete, returning to
`noPriorMemory`. It asserts stable exit codes across all three output modes, that
the analyzed project stays byte-identical except the test-authored edit, and that
no token, absolute path, or raw body appears in stored/exported bytes. No MCP
server is launched and no network is used.

## Release-Packaging Deferral

The public stable artifact remains `v0.2.0`. `@oh-my-pm/project-memory` is a
dev/build-time-only workspace dependency of the CLI, loaded lazily via a dynamic
import on the memory path only; it is not included in the historical/current v0.2
release bundle, and legacy installed-artifact commands still load and run without
resolving it. Full installed-artifact qualification of the memory commands is
deferred to Phase 6; nothing here claims release readiness.

## Tests

Parser tests cover every subcommand in all output modes, the exact six-subcommand
allowlist, option validation, duplicate/mutation-only/half-pair/wrong-confirm
rejection, and legacy parser regression. Config tests prove the optional
`projectId`, valid/invalid handling, override, and that the CLI never writes
config. Process tests prove preview zero-write safety, capture apply, idempotency,
the required-source no-write failure, status/history/changes/export/delete
behavior, byte-deterministic changes under a fixed clock, the clock-consumed-once
boundary, that legacy commands read no clock, and the version-state → status
mapping. Boundary tests prove runCli fails closed on memory and that Project
Memory is imported only via a dynamic import. The source-workspace e2e runs the
full journey as a child process.

## Acceptance Status

- **G1 (no v0.2 regression):** the full suite stays green; existing command
  outputs are unchanged.
- **G2 (no project writes):** tests assert the analyzed project is byte-identical
  before and after every command.
- **G3/G4/G5:** exercised through the CLI — deterministic snapshot fingerprints,
  byte-deterministic change output under a fixed clock, and evidence-backed
  state, all via the real Kernel/Runtime.
- **G6 (explicit local-state write):** complete for the source/workspace CLI —
  state is written only by `capture --apply` / `delete --apply`; every preview
  and read path writes nothing.
- **G7 (export/delete):** exposed preview-first and proven round-trip.
- **G8–G11:** preserved (Phase 2/3 transactional migration, corruption safety,
  concurrency lock, and no-credential/no-telemetry guarantees are unchanged).
- **G12:** not started (no MCP projection is added; the ten-tool set is intact).
- **G13:** source cross-platform tests only; installed-artifact qualification is
  pending Phase 6.
- **G14 (v0.2 unaffected):** `version.json`, the release workflows, the ten-tool
  MCP surface, and the installed-archive contract are unchanged.

## Explicit Non-Implementation of Phases 5–6

Phase 5 (a minimal read-only MCP projection with zero MCP write tools) and Phase
6 (installed-artifact release qualification) are **not** implemented. This phase
adds no MCP tool or change, no release-packaging change for v0.3, no tag or
release, and no claim that the memory commands are available from the published
v0.2 artifact. Each remaining phase requires a separate, explicit approval.
