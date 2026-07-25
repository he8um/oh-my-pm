# v0.3 Security and Privacy — Project Brain

The Project Brain introduces the product's first application-state write. This
document defines what stays exactly as it is, what the single new boundary is, and
a threat model for the new surface. Planning only.

## Preserved trust model (unchanged)

Every v0.2 guarantee is preserved without exception:

- **no project-file writes** — the analyzed project is read-only, always;
- **no project-content upload** — nothing leaves the machine;
- **no telemetry** — none is added;
- **network only through explicit providers** — GitHub stays GET-only, single
  fixed origin, single page, opt-in;
- **MCP stays stdio-only** — no HTTP transport is introduced;
- **the existing ten MCP tools stay backward compatible** — none is renamed,
  reordered, or removed;
- **local Markdown workflows stay fully offline**;
- **tokens stay environment-only** — never persisted, never printed, never stored
  in memory records.

## The one new boundary: application-state writes

A precise distinction runs through the whole design:

| | Project writes | Application-state writes |
|---|---|---|
| Allowed? | **Prohibited** | **Explicit and user-controlled** |
| Location | never | only the OH MY PM application-data directory |
| Inside the analyzed project? | never | never |
| Trigger | — | an explicit mutating command (`memory capture` / `memory delete`) |
| Reversible? | — | export and delete are first-class |
| Contents | — | minimized snapshots + evidence fingerprints; documented exactly |

The new write boundary, stated as rules:

1. writes land **only** in an explicit OH MY PM application-data location;
2. never inside the analyzed project by default (or ever, for state);
3. never edits project documents;
4. requires an explicit mutating command — read commands never write;
5. supports **export** and **delete** of everything stored;
6. **documents exactly what is stored** (minimized evidence, fingerprints,
   snapshots, identity id + non-absolute hint) and what is not (raw bodies,
   absolute paths, credentials).

## What is stored, precisely

- `ProjectIdentity`: a salted derived id (or explicit id) and a **non-absolute**
  root hint. Never the raw absolute path.
- `EvidenceRecord` (default `minimized`): a content **fingerprint** plus already-
  allow-listed provenance/metadata (line/range, severity, status). **Not** raw
  document text and **not** GitHub bodies.
- `ProjectSnapshot`: canonical `ProjectState`, evidence refs, boundaries, a
  deterministic fingerprint.
- Never stored, under any policy: tokens or any credential; absolute paths;
  raw comment/review/PR bodies, diff hunks, or commit identifiers (the same
  content the MCP layer already refuses to project); telemetry.

## Threat model

For each threat: asset, threat, boundary, mitigation, test evidence, residual
risk.

### T1 — Sensitive local content in memory

- **Asset:** private project text.
- **Threat:** verbatim private content persisted to disk.
- **Boundary:** evidence ledger `rawContentPolicy`.
- **Mitigation:** default `minimized` stores fingerprints + allow-listed fields,
  not text; verbatim storage is `stored-opt-in` only and never for GitHub bodies.
- **Test evidence:** a persistence test asserts no raw body/text is written under
  the default policy; a fixture proves fingerprints round-trip without content.
- **Residual:** with opt-in verbatim storage the user knowingly stores text
  locally; documented, never uploaded.

### T2 — Stored absolute paths

- **Asset:** the user's directory layout / username.
- **Threat:** absolute project paths persisted or projected.
- **Boundary:** identity + display-path rule.
- **Mitigation:** store a salted derived id and a non-absolute hint only, reusing
  the existing config display-path discipline.
- **Test evidence:** a test scans written records for path separators resembling
  absolute paths and for the home directory string.
- **Residual:** minimal; an explicit id chosen by the user may embed a name they
  picked.

### T3 — Credentials in provider data

- **Asset:** the GitHub token.
- **Threat:** a token reaching a stored record.
- **Boundary:** the existing env-only token boundary + secret-marker rejection.
- **Mitigation:** the provider core never reads the environment; evidence
  minimization allow-lists fields; secret-marked keys are rejected as they are in
  config today.
- **Test evidence:** a test asserts the token env var value never appears in any
  written record.
- **Residual:** none identified.

### T4 — Malicious project content

- **Asset:** the capture process.
- **Threat:** crafted Markdown/GitHub content aiming to break parsing or inflate
  storage.
- **Boundary:** deterministic extraction + strict size limits.
- **Mitigation:** reuse the existing bounded, exact-match extraction (≤20 risks,
  ≤10 tasks, fenced-code ignored); apply per-record and per-snapshot size caps.
- **Test evidence:** fixtures with oversized/adversarial content assert bounds
  hold and storage stays capped.
- **Residual:** low.

### T5 — Symlink / path traversal

- **Asset:** files outside the root / outside the data dir.
- **Threat:** a symlink or `..` escaping the read root or the data dir.
- **Boundary:** root confinement (read) and data-dir confinement (write).
- **Mitigation:** reuse the existing symlink-refusing, `..`-containment read
  boundary; apply the same confinement to the state adapter's writes.
- **Test evidence:** traversal fixtures assert refusal on both read and write
  sides.
- **Residual:** none identified.

### T6 — Database / state corruption

- **Asset:** the local memory.
- **Threat:** a truncated or corrupt record making state unreadable.
- **Boundary:** integrity fingerprints + atomic writes.
- **Mitigation:** per-record fingerprints and a manifest checksum; writes are
  temp-then-rename; a failed integrity check fails **safe** (reports corruption,
  refuses to silently proceed) — never a destructive auto-repair.
- **Test evidence:** a test corrupts a record and asserts a safe, explicit
  failure with a recovery hint.
- **Residual:** a corrupt store may require `memory delete` + re-capture;
  acceptable and documented.

### T7 — Concurrent processes

- **Asset:** store consistency.
- **Threat:** two captures racing.
- **Boundary:** single-writer lock.
- **Mitigation:** a data-dir lock file with stale detection; reads never lock.
- **Test evidence:** a concurrency test asserts serialized captures and no partial
  snapshot.
- **Residual:** low.

### T8 — Schema downgrade

- **Asset:** stored state written by a newer version.
- **Threat:** an older binary misreading a newer schema.
- **Boundary:** on-disk schema version + migration table.
- **Mitigation:** every store carries a schema version; an unsupported **newer**
  version is refused with a clear message rather than misread.
- **Test evidence:** a test opens a higher-versioned store and asserts a refusal,
  not a corruption.
- **Residual:** the user must upgrade to read newer state; documented.

### T9 — Untrusted imported state

- **Asset:** the store.
- **Threat:** a hand-edited or malicious exported bundle imported back.
- **Boundary:** import validation.
- **Mitigation:** imports are schema-validated and integrity-checked before use;
  invalid imports are rejected, never partially applied. (Import may be deferred
  past the first slice; when present it is validated.)
- **Test evidence:** malformed-import fixtures assert rejection.
- **Residual:** low.

### T10 — Oversized evidence

- **Asset:** disk / memory.
- **Threat:** unbounded growth.
- **Boundary:** strict size and count limits + retention.
- **Mitigation:** per-record and per-snapshot caps; a documented retention policy
  bounds history.
- **Test evidence:** a test asserts caps and retention pruning.
- **Residual:** low.

### T11 — MCP data overexposure

- **Asset:** projected state.
- **Threat:** a future MCP projection leaking raw content.
- **Boundary:** sanitized projections (existing rule).
- **Mitigation:** any MCP surface over memory reuses the strict projection rules
  (no bodies, no tokens, no absolute paths); the first Project Brain release ships
  **no** MCP write tool and may ship **zero** new tools.
- **Test evidence:** projection tests assert no raw content; the ten-tool set
  stays intact until a projection is deliberately added.
- **Residual:** none while zero tools are added; bounded when one is.

### T12 — Project identity collision

- **Asset:** correct per-project separation.
- **Threat:** two projects sharing an id, mixing state.
- **Boundary:** identity resolution.
- **Mitigation:** salted derived ids from normalized roots; explicit ids are the
  user's deliberate choice to unify.
- **Test evidence:** a test asserts distinct roots yield distinct derived ids and
  that state never crosses ids.
- **Residual:** an explicit id collision is user-chosen and documented.

### T13 — Forged timestamps

- **Asset:** freshness correctness.
- **Threat:** a source reporting a false `updatedAt`.
- **Boundary:** freshness derivation.
- **Mitigation:** freshness separates source-reported time from observed time;
  Markdown source time is `unknown` (fingerprint-change-based), so a forged file
  mtime cannot fake freshness; the injected `now` is the trusted clock.
- **Test evidence:** a test with a future/absent `sourceUpdatedAt` asserts
  `unknown`/coverage handling, not false freshness.
- **Residual:** a provider that lies about its own `updatedAt` affects only
  `sourceFreshness`, which is labeled as source-reported.

### T14 — Partial provider data

- **Asset:** honest state.
- **Threat:** a provider failure silently read as "nothing there."
- **Boundary:** coverage in `sourceBoundaries` + freshness.
- **Mitigation:** a failed/partial source is a recorded coverage gap, never an
  empty-but-fresh result.
- **Test evidence:** a test injects a provider failure and asserts a coverage gap
  is recorded and surfaced.
- **Residual:** low.

## Required controls (summary)

strict size limits · schema validation · root and data-dir confinement · data
minimization · transactional (atomic) writes · integrity fingerprints · safe
import validation · explicit export/delete · no secrets stored · no telemetry ·
sanitized MCP projections.

## Residual-risk posture

The only genuinely new privacy surface is the local, minimized, user-controlled,
exportable, deletable memory. It never leaves the machine, never enters the
project, never stores a credential, and defaults to fingerprints over content. The
residual risks above are all local, bounded, and documented — none reintroduce
upload, telemetry, project writes, or credential storage.
