# v0.3 Implementation Plan — Project Brain

Seven independently testable phases. Each defines objective, allowed files/
packages, deliverables, tests, acceptance criteria, stop conditions, complexity
(S/M/L), and dependencies. No calendar dates. **Nothing here is authorized to
begin without a separate, explicit approval, and only Phase 0 may start when that
approval is given.** The minimal vertical slice is Phases 0→4; Phase 5 (MCP) and
Phase 6 (release qualification) follow.

## Minimal vertical slice (the journey to prove)

1. analyze a local project (unchanged v0.2 behavior);
2. explicitly `capture` the current observation;
3. store a minimized local snapshot **outside** the project;
4. change the project;
5. `capture` again;
6. report deterministic `changes` against the previous snapshot;
7. inspect evidence references;
8. `export` or `delete` local memory.

## Candidate CLI surface (budget: ≤ 6 commands, one namespace)

```
oh-my-pm memory capture <root>     # explicit capture (preview first)
oh-my-pm memory changes <root>     # deterministic diff vs previous snapshot
oh-my-pm memory status <root>      # freshness/coverage + latest snapshot summary
oh-my-pm memory history <root>     # list snapshots for a project
oh-my-pm memory export <root>      # export local memory (non-mutating)
oh-my-pm memory delete <root>      # delete/reset local memory (explicit mutating)
```

CLI conventions reused from v0.2: preview-first for mutating commands; `--json`
and `--markdown` output; brief text default; exit `0` success, `2` controlled/
parse failure, `1` unexpected. Non-interactive operation; a partial observation
is reported as a coverage gap, not a silent success; a missing prior snapshot is
an explicit "no previous observation," not an error.

---

## Phase 0 — Contracts and architecture guards · complexity M

- **Objective:** define the six versioned contracts and the guardrails, with no
  persistence and no behavior.
- **Allowed files/packages:** `contracts/schema/*`, generated `contracts/
  generated/**`, `tools/gen-contracts.mjs` if a generator rule is needed,
  validator additions in `tools/validate-*.mjs`.
- **Deliverables:** `ProjectIdentity`, `EvidenceRecord`, `ProjectState`,
  `ProjectSnapshot`, `ChangeSet`, `Freshness` schemas; deterministic TS + Rust
  generation; boundary invariants (no new network marker, no project write path).
- **Tests:** contract generation determinism; schema round-trip; validator
  invariants green.
- **Acceptance:** contracts generate deep-equal on repeat; `pnpm validate` green;
  no source behavior changed.
- **Stop conditions:** any need to add a runtime dependency, a network path, or a
  project write → stop and escalate.
- **Dependencies:** none.

## Phase 1 — Deterministic kernel state and diff logic · complexity L

- **Objective:** pure normalization, stable matching, change classification, and
  freshness rules in the kernel.
- **Allowed files/packages:** `kernel/crate/src/**`, `kernel/binding/**`, kernel
  tests, golden fixtures under `examples/fixtures/**`.
- **Deliverables:** pure functions for canonical `ProjectState` normalization,
  `stateFingerprint`, snapshot `fingerprint`, and `diff(previous, current)` →
  `ChangeSet` using only the existing stable identifiers; freshness derivation.
- **Tests:** golden fixtures for each change category; determinism (deep-equal on
  repeat, same injected clock); `removed`+`added` chosen over uncertain
  `modified`; Rust `purity` test extended.
- **Acceptance:** G3 and G4 (deterministic fingerprint and change output) proven
  on fixtures; no I/O in the kernel.
- **Stop conditions:** any fuzzy matching requirement → stop; redesign identifiers
  instead.
- **Dependencies:** Phase 0.

## Phase 2 — Local persistence adapter · complexity L

- **Objective:** an explicit persistence interface and a single Node adapter that
  writes application state atomically, with export/delete and integrity — **no
  public mutating command yet.**
- **Allowed files/packages:** the persistence interface (pure contract consumed by
  the runtime), one explicit Node adapter module, its tests; the application-data
  location resolver (mirroring the existing config resolver, data variant).
- **Deliverables:** schema creation, atomic (temp-then-rename) writes, per-record
  and manifest integrity fingerprints, export (copy) and delete (remove), schema-
  version stamping, migration-table scaffold, corruption detection (fail-safe).
  The persistence **format** decision (JSON/JSONL default) is finalized here
  against the recorded evaluation; a dependency is added only if that decision
  proves it necessary and only under a separate approval.
- **Tests:** atomic-write crash simulation; integrity round-trip; corruption →
  safe failure; export/delete; data-dir confinement + traversal refusal;
  concurrency lock.
- **Acceptance:** G6-adjacent adapter behavior proven; writes confined to the data
  dir; no project write; export/delete work.
- **Stop conditions:** any write landing inside a project root, or any native
  dependency added without separate approval → stop.
- **Dependencies:** Phase 0.

## Phase 3 — Runtime capture and compare · complexity M

- **Objective:** provider-independent orchestration of capture and compare through
  the runtime, with the transaction boundary.
- **Allowed files/packages:** `runtime/src/**`, `skills/src/**` (state derivation
  extension), runtime/skills tests.
- **Deliverables:** capture = read-only observe → derive `ProjectState` → minimize
  evidence → validate/fingerprint (kernel) → transactional snapshot write; compare
  = read two snapshots → kernel diff; partial-observation coverage handling.
- **Tests:** capture/compare e2e with injected clock; partial observation → coverage
  gap; rollback on write failure; raw provider data never persisted.
- **Acceptance:** the vertical slice works end-to-end below the CLI; determinism
  holds.
- **Stop conditions:** any provider learning about memory → stop (providers stay
  read-only acquisition only).
- **Dependencies:** Phases 1 and 2.

## Phase 4 — Minimal CLI surface · complexity M

- **Objective:** the explicit `memory` commands with preview and structured output.
- **Allowed files/packages:** `cli/src/**`, `cli/bin/**`, CLI tests, getting-
  started additions.
- **Deliverables:** `memory capture|changes|status|history|export|delete` with
  preview-first mutation, `--json`/`--markdown`, consistent exit codes, non-
  interactive operation.
- **Tests:** parser, process, format, e2e per command; preview writes nothing;
  delete requires explicit confirmation.
- **Acceptance:** the full eight-step journey runs from the CLI, offline, writing
  nothing in the project.
- **Stop conditions:** exceeding the six-command budget, or any mutating command
  without preview/confirmation → stop.
- **Dependencies:** Phase 3.

## Phase 5 — Minimal read-only MCP exposure · complexity M

- **Objective:** bounded, sanitized, read-only projection over captured state —
  **only after contracts stabilize.**
- **Allowed files/packages:** `mcp-server/src/**`, MCP tests, the tool-count
  verifiers.
- **Deliverables:** at most **one** new read-only tool (e.g. `project_changes`),
  sanitized exactly like existing projections; **the first Project Brain release
  ships zero MCP write tools** and may ship zero new tools.
- **Tests:** projection sanitization (no bodies/tokens/absolute paths); tool-count
  and order verifiers updated deliberately; stdio-only preserved.
- **Acceptance:** G12 (bounded sanitized MCP exposure); no write tool; no HTTP.
- **Stop conditions:** any MCP write tool, HTTP transport, or unsanitized field →
  stop.
- **Dependencies:** Phase 4; contracts stable.

## Phase 6 — Release qualification · complexity M

- **Objective:** prove the slice ships safely cross-platform.
- **Allowed files/packages:** release/install tooling and CI as needed; no product
  behavior change.
- **Deliverables:** cross-platform install proof (Windows/macOS/Linux) with a data
  directory present; migration tests; corruption-recovery test; privacy audit;
  RC decision.
- **Tests:** installed-artifact capture/compare on three platforms; migration
  round-trip; corruption → safe recovery; privacy scan (no secrets/paths/content).
- **Acceptance:** G13 (portable install) and all gates green; deliberate RC
  decision.
- **Stop conditions:** any gate red → stop; no automatic RC.
- **Dependencies:** Phases 0–5.

## First implementation phase

**Phase 0 only.** When implementation is separately approved, the first and only
authorized step is Phase 0 (contracts + guards, no persistence, no behavior).
Each subsequent phase begins only after the prior phase's acceptance criteria and
gates are met.
