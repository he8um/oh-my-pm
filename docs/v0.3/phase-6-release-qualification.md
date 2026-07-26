# v0.3 Phase 6 — Installed-Artifact Release Qualification and RC Preparation

Phase 6 qualifies and packages the already-approved Project Brain feature slice
into a self-contained, cross-platform release candidate. It adds **no product
behavior**: no seventh memory subcommand, no second Project Brain MCP tool, no
MCP write tool, no GitHub capture in the memory CLI, no automatic migration, no
restore/import/prune/repair, no HTTP/SSE/WebSocket MCP, no cloud/telemetry/UI.

The prepared source version is `0.3.0-rc.1`. Phase 6 does **not** create a tag,
GitHub Release, or registry artifact; publication of `v0.3.0-rc.1` is a separate,
explicitly authorized action performed through the protected release workflow.

## Release-profile separation

The historical **v0.2** bundle and the new **v0.3** bundle are separated by an
explicit, self-describing release profile rather than version-string branching.
The bundle's own `RELEASE.json` declares the profile, and every verifier resolves
its expectations from it and **fails closed** on an unknown profile.

| | v0.2 historical profile | v0.3 profile |
| --- | --- | --- |
| `bundleProfile` | absent (defaults to `source-v0.2`) | `project-brain` |
| MCP tools | ten | eleven (adds `project_changes`) |
| Project Memory package | not bundled | bundled (dist-only) |
| Project Brain schema | — | 1 |
| Project Memory store format | — | 2 |
| memory subcommands | — | six |
| MCP write tools | — | 0 |
| Status | published, immutable | current source prepares this |

`RELEASE.json` for the v0.3 profile adds `releaseLine: "v0.3"`,
`bundleProfile: "project-brain"`, `expectedMcpToolCount: 11`, and a `projectBrain`
block (`schemaVersion: 1`, `storeFormatVersion: 2`, the six `memorySubcommands`,
`mcpReadTools: 1`, `mcpWriteTools: 0`, `automaticMigration: false`,
`projectWrites: false`). The historical v0.2 workflows and release docs are
unchanged and never claim eleven tools or Project Brain availability.

## Self-contained bundle and runtime resolution

`@oh-my-pm/project-memory` moved from a **dev** dependency to a **runtime**
dependency of the two packages that actually load it — `@oh-my-pm/cli` and
`@oh-my-pm/mcp-server` — both of which reach it only through a lazy dynamic
`import()`. `pnpm deploy --prod` therefore bundles the built package (dist-only:
`package.json`, `dist/**`, README). The lazy import is preserved, so a genuine
absence still falls back safely to the ten-tool surface. No external dependency
was added; the lockfile change is exactly the two `workspace:*` link moves.

Result, proven end to end on the installed artifact:

- the installed CLI `memory` commands resolve Project Memory;
- the installed MCP resolves Project Memory and registers `project_changes`
  (eleven tools);
- no package-manager install, registry, or network resolution occurs at runtime;
- no absolute repository path is embedded; the install is relocatable.

## Installed qualification

`tools/check-v0.3-installed-project-brain.mjs` drives the **installed** artifact
(the `oh-my-pm` / `oh-my-pm-mcp` shims under a temporary prefix), never the
workspace entrypoints. It supports Windows/macOS/Linux, uses only Node.js 20+
built-ins plus the MCP SDK and Project Memory contained in the artifact, and
isolates every writable location (extraction, prefix, project fixtures,
HOME/XDG_DATA_HOME/LOCALAPPDATA/APPDATA, export destinations) to temporary
directories. It accepts either an already-installed `--prefix` or an `--archive`
to extract, install, and qualify.

It qualifies:

- **Legacy commands** (`status`, `doctor`) run and create no application-data
  directory.
- **The full CLI journey**: `status → noPriorMemory`, capture preview (zero
  writes), capture apply (one commit), edit the fixture, second capture, status
  (healthy, two snapshots, format 2 / schema 1), history (newest capture first,
  `native` chronology), changes (default pair and explicit pair, zero writes),
  export (preview then apply), delete (preview then apply), status
  (`noPriorMemory`) — across **brief**, **`--json`**, and **`--markdown`** modes,
  all newline-terminated, with stable exit codes.
- **Project immutability**: the project fixture is byte-identical except the
  deliberate test-authored README edits; no store is written inside the project.
- **The installed MCP**: exactly eleven tools in exact order; `project_brief` and
  `provider_status` offline; `project_changes` before/after captures
  (`noPriorMemory → compared → noPriorMemory`), capture-order chronology, bounded
  strict projection with no evidence ids / raw values / paths / traces; stdio
  only; empty stderr on success; no write, lock, migration, or network.
- **Data locations**: capture against the platform-standard app-data root and via
  an explicit `--data-dir`, with no resolved path in public output.
- **Migration** `1 → 2`: a deterministic, public-safe v1 store (three snapshots,
  latest in the middle of the lexical inventory) is planted with the installed
  Project Memory builders; read commands refuse (migrationRequired) with zero
  writes; `--migrate-store` preview reports `wouldMigrateStore` with zero writes;
  `--apply` without `--migrate-store` exits 4; `--apply --migrate-store` migrates
  once and captures once; backup retained; manifest becomes store format 2 with
  `recoveredV1` chronology; recovered order and latest pinning are verified.
- **Corruption**: a corrupted snapshot envelope and a manifest chronology
  corruption are detected and fail safely (no auto-repair, no store byte
  rewritten); the MCP returns a controlled sanitized error; a manual backup
  restore returns the store to healthy and byte-identical.
- **Concurrency**: two concurrent same-project captures are serialized — exactly
  one commits and the other fails in a controlled, structured way with no stack
  trace and no partial/duplicate chronology; different projects proceed
  independently.
- **Privacy**: planted token/authorization/secret/fingerprint sentinels (in the
  token env var and Markdown prose, distinct from derived task titles) never
  appear in the store, export, or output; no URL/network origin, raw provider
  response, or runtime trace in the store.
- **Source independence and relocation**: no shim embeds a source-checkout path;
  POSIX executable modes and Windows `.cmd` shims are present.

## Cross-platform artifact matrix

`.github/workflows/v0.3-installed-qualification.yml` (non-publishing, `contents:
read`) prepares **one** deterministic candidate archive set on Ubuntu and tests
that **same** artifact on Ubuntu, macOS, and Windows (Node 20). The archive
system is byte-reproducible and produces `oh-my-pm-v<version>.tar.gz`,
`oh-my-pm-v<version>.zip`, and `oh-my-pm-v<version>-SHA256SUMS.txt` with
equivalent logical inventories.

## RC release workflow

`.github/workflows/release-v0.3-rc.yml` is `workflow_dispatch`-only, defaults
`publish` to `false` and `confirmation` to empty, grants top-level `contents:
read`, and grants `contents: write` exactly once (the publish job). The publish
job depends on the cross-platform qualification matrix, requires
`publish == true` with `confirmation == "RELEASE v0.3.0-rc.1"` and
`version == "0.3.0-rc.1"`, refuses to overwrite an existing tag/release, targets
the exact workflow commit SHA, creates a `--prerelease` (never `--latest`)
release named "OH MY PM v0.3.0-rc.1" with exactly the three assets, and performs
no registry publish. It is not dispatched during Phase 6.

## Acceptance gates

All applicable gates (G1–G14) are green: v0.2 workflows and the historical
ten-tool surface are unaffected (G1, G14); no project writes (G2); deterministic
snapshot/change fingerprints and evidence traceability (G3–G5); explicit
write/export/delete (G6, G7); explicit transactional migration with backup (G8);
safe corruption handling with no auto-repair (G9); serialized concurrency with no
partial state (G10); a clean planted-sentinel privacy scan with no
telemetry/network (G11); the bounded eleven-tool stdio MCP with one read tool and
zero write tools (G12); a portable install proven on Windows/macOS/Linux with
Node 20+ and no native dependency (G13).

## Decision

`PHASE 6 COMPLETE — v0.3.0-rc.1 READY FOR SEPARATE EXPLICIT PUBLICATION.` This
readiness applies to the release candidate only and does not imply stable v0.3
readiness.
