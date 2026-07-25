# v0.3 Option Evaluation

Four candidate directions were evaluated against the stable `v0.2.0` product.
Each is scored 1 (worst) to 5 (best) on eleven dimensions. Scores are justified,
then the decision rules are applied.

## The four candidates

- **A. Distribution & UX** — CLI `--help`, installed MCP configuration,
  self-update, stable/RC channels, rollback UX, richer doctor.
- **B. Project Brain Foundation** — canonical project state, evidence ledger,
  local persistence, snapshots, change engine, freshness, history.
- **C. MCP Intelligence** — `project_health`, `project_changes`,
  `project_decisions`, `project_readiness`, MCP resources.
- **D. More integrations** — ClickUp, Airtable, Jira, Linear, GitHub Projects.

## Scoring dimensions

1. User value · 2. Architectural leverage · 3. Fit with current product ·
4. Independence from missing foundations (higher = depends on *less* that is
missing) · 5. Privacy compatibility · 6. Deterministic feasibility ·
7. Backward-compatibility safety (higher = *safer*) · 8. Implementation size
(higher = *smaller*) · 9. Testability · 10. Release safety (higher = *safer*) ·
11. Future extensibility.

## Score matrix

| Dimension | A. Dist/UX | B. Project Brain | C. MCP Intelligence | D. Integrations |
|---|:--:|:--:|:--:|:--:|
| 1. User value | 2 | 5 | 4 | 3 |
| 2. Architectural leverage | 1 | 5 | 2 | 1 |
| 3. Fit with current product | 4 | 5 | 4 | 3 |
| 4. Independence from missing foundations | 5 | 4 | 1 | 1 |
| 5. Privacy compatibility | 5 | 4 | 4 | 2 |
| 6. Deterministic feasibility | 5 | 4 | 3 | 3 |
| 7. Backward-compatibility safety | 5 | 4 | 2 | 3 |
| 8. Implementation size (smaller = higher) | 4 | 2 | 3 | 2 |
| 9. Testability | 5 | 4 | 3 | 3 |
| 10. Release safety (safer = higher) | 5 | 4 | 2 | 2 |
| 11. Future extensibility | 1 | 5 | 3 | 2 |
| **Total** | **42** | **46** | **31** | **25** |

## Per-score rationale

### A. Distribution & UX — total 42

- **User value 2** — real but small; the product is already usable and
  documented. `--help` (L1) and installed MCP config (L2) remove friction, not
  ceilings.
- **Architectural leverage 1** — builds nothing other work reuses.
- **Fit 4** — squarely within the existing surface.
- **Independence 5** — needs no missing foundation.
- **Privacy 5** — no new data.
- **Determinism 6→5** — trivially deterministic.
- **Backward-compat 5** — additive help text and a config emitter are low risk.
- **Size 4** — small.
- **Testability 5** — easy.
- **Release safety 5** — very safe.
- **Extensibility 1** — a dead end; nothing builds on it.

A is cheap and safe but strategically inert. It is the right *maintenance* work,
not the right *minor version*.

### B. Project Brain Foundation — total 46 (selected)

- **User value 5** — answers the highest-value unmet question, "what changed,"
  and unlocks decisions/health/readiness downstream.
- **Architectural leverage 5** — the state + evidence + snapshot + diff layer is
  the substrate every future intelligence surface needs; build once, reuse
  everywhere.
- **Fit 5** — extends the existing pure-kernel + generated-contracts + read-only-
  provider design instead of contradicting it.
- **Independence 4** — it *is* the missing foundation, so it depends on almost
  nothing else; the small deduction is for the new persistence adapter it must
  introduce.
- **Privacy 4** — introduces the first application-state write, so it carries the
  most new privacy surface of any option — but that surface is explicit,
  local-only, minimized, and exportable/deletable by design (deduct 1 for the
  genuine new surface, not for a weakness).
- **Determinism 4** — the diff/matching/freshness engine is rule-based and
  clock-injected like the existing extraction; determinism is achievable but must
  be engineered (stable identifiers, no fuzzy matching), hence 4 not 5.
- **Backward-compat 4** — strictly additive and optional; the small deduction is
  for the new on-disk schema that must be versioned and migratable from day one.
- **Size 2** — the largest option; mitigated by phasing (contracts → kernel diff
  → persistence → runtime → CLI → MCP → release).
- **Testability 4** — pure kernel diff logic and golden snapshot fixtures are
  highly testable; persistence and migration add integration surface.
- **Release safety 4** — each phase is independently shippable behind gates; the
  first release ships **zero** MCP write tools.
- **Extensibility 5** — the highest; it is the platform the rest of the roadmap
  stands on.

### C. MCP Intelligence — total 31

- **User value 4** — attractive surfaces (`project_changes`, `project_health`).
- **Architectural leverage 2** — the tools are thin over data that does not exist.
- **Independence 1** — *fully blocked*: `project_changes` needs a prior
  observation, `project_decisions` needs a decision store, `project_health` needs
  freshness — none exist. Building these first forces a private, throwaway state
  model inside the MCP layer.
- **Backward-compat 2** / **Release safety 2** — expands the frozen ten-tool MCP
  surface, the highest-scrutiny public contract, before the data is stable.
- Chosen scores reflect the decision rule: **do not add more MCP reports before
  canonical data exists.**

### D. More integrations — total 25

- **User value 3** — more sources is nice-to-have.
- **Architectural leverage 1** / **Independence 1** — each new provider without a
  provider-independent state model multiplies per-provider state handling and
  bakes provider shapes into everything downstream.
- **Privacy 2** — each integration widens the network and credential surface.
- Chosen scores reflect the decision rule: **do not choose integrations before a
  provider-independent state model exists.**

## Decision rules applied

- *Do not choose integrations before a provider-independent state model exists.*
  → **D deferred.** The Project Brain is exactly that model; integrations become
  cheap and safe **after** it.
- *Do not choose more MCP reports before canonical data exists.* → **C deferred.**
  Its tools are the natural read-only surface **over** the Project Brain.
- *Do not choose UX polish as the main minor version unless it is the highest-
  value blocker.* → **A is not the headline.** L1/L2 are handled as maintenance
  or folded into v0.3's own CLI/MCP surface, not elevated to the minor version's
  purpose.

## Selected direction and sequence

**Selected: B — Project Brain Foundation.**

Recommended sequence for the deferred candidates, each unblocked by B:

1. **B (v0.3)** — canonical state, evidence, snapshots, deterministic changes,
   freshness, local persistence, capture/compare/history, export/delete.
2. **C (after B)** — read-only MCP projections over the captured state
   (`project_changes`, then `project_decisions`, `project_health`,
   `project_readiness`), added incrementally and sanitized.
3. **A (in parallel / maintenance)** — L1 (`--help`) and L2 (installed MCP config)
   handled as low-risk improvements; v0.3's own CLI/MCP surface can subsume them.
4. **D (last)** — new providers, now that a provider-independent state model
   absorbs each new source without reshaping the core.

The order is not arbitrary: each later step is cheaper and safer precisely
because B is built first.
