# v0.3 Acceptance Gates — Project Brain

Fourteen hard gates. Each is binary and has measurable evidence. No Project Brain
phase ships without its relevant gates green. These are the conditions any future
implementation must satisfy; this document defines them, it does not run them.

| Gate | Requirement | Measurable evidence |
|---|---|---|
| **G1** | No regression in v0.2 workflows | The existing full suite (`pnpm build`, `pnpm test`, `pnpm validate`, `pnpm mcp:smoke`, `cargo test`) stays green; `brief`/`risks`/`next`/`handoff`/`github`/`providers` outputs unchanged on the existing fixtures. |
| **G2** | No project-file writes | A test asserts the analyzed project directory is byte-identical before and after `capture`/`changes`/every command; no write path targets a project root. |
| **G3** | Deterministic snapshot fingerprint | Capturing the same project with the same inputs and injected clock produces an equal `ProjectSnapshot.fingerprint` (deep-equal on repeat). |
| **G4** | Deterministic change output | `diff(previous, current)` is deep-equal on repeat for the same two snapshots and injected clock; golden fixtures per change category. |
| **G5** | Evidence traceability | Every non-trivial `ProjectState` claim references at least one `EvidenceRecord`; `ProjectState` is rebuildable from the evidence set (a rebuild test reproduces the state fingerprint). |
| **G6** | Explicit local-state write command | State is written only by an explicit mutating command (`memory capture`/`memory delete`); read commands and previews write nothing (asserted by a no-write test on read paths). |
| **G7** | Export and delete work | `memory export` produces a complete, re-readable copy; `memory delete` removes all stored state for the project; both are tested round-trip. |
| **G8** | Transactional migration | A schema migration runs inside a transaction with a backup; a mid-migration failure leaves the prior state intact and readable (tested with an injected failure). |
| **G9** | Corrupted state fails safely | A corrupted record is detected by integrity fingerprint and produces an explicit, non-destructive failure with a recovery hint — never a silent misread or auto-clobber (tested by corrupting a record). |
| **G10** | Controlled concurrent access | Two concurrent captures are serialized by the data-dir lock; no partial snapshot is ever committed (concurrency test). |
| **G11** | No credentials or telemetry | A scan of all written records asserts the token env value never appears; no telemetry endpoint, emitter, or network call exists in the memory path. |
| **G12** | Bounded sanitized MCP exposure | If an MCP projection is added, it exposes no raw bodies, tokens, or absolute paths, stays stdio-only, and adds no write tool; otherwise the ten-tool set is unchanged (verifier + projection tests). |
| **G13** | Portable install | The installed artifact runs `capture`/`changes` with a data directory on Windows, macOS, and Linux, needing only Node.js 20+ (no native dependency), proven in CI. |
| **G14** | v0.2 remains unaffected | `version.json`, the release workflows, the ten-tool MCP surface, and the installed-archive contract are unchanged by the memory feature; v0.2 provider/kernel/installer behavior is byte-stable. |

## Gate-to-phase mapping

| Phase | Gates that must be green to exit the phase |
|---|---|
| 0 — Contracts | G14 (surface unaffected), plus generation determinism |
| 1 — Kernel diff | G3, G4, G5 |
| 2 — Persistence | G6, G7, G8, G9, G10, G11 |
| 3 — Runtime | G2, G5, plus capture/compare determinism |
| 4 — CLI | G1, G2, G6, G7 |
| 5 — MCP | G12 |
| 6 — Release | G1, G13, G14, and a full re-run of G2–G12 on the installed artifact |

## Reject conditions (a plan that trips any of these is invalid)

A Project Brain plan or phase is rejected outright if it contains any of:

- mandatory cloud, remote database, or account;
- hidden project writes (any write inside the analyzed project);
- unbounded raw-content persistence (verbatim content stored by default);
- an MCP **write** tool;
- automatic migration without a backup and a recovery path;
- a new external provider dependency;
- a source **version bump** during the discovery/planning stage;
- any claim that v0.3 is implemented when it is not.
