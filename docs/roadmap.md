# Roadmap

Every entry below carries one of five explicit states:

| State                        | Meaning                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| **Shipped**                  | implemented, released, and published                        |
| **Prepared but unpublished** | implemented and merged, but no tag or GitHub release exists |
| **Active maintenance**       | the scope currently being worked on                         |
| **Planned**                  | agreed direction, not designed or implemented               |
| **Out of scope**             | deliberately excluded                                       |

The latest **published** stable release is
[`v0.5.3`](https://github.com/he8um/oh-my-pm/releases/tag/v0.5.3), which is also
the current source version. The active maintenance scope is the v0.5 line:
`v0.5.4` (contract and repository consistency) is the next planned patch. The
next line, **v0.6**, is planned and not started.

Phases 0 through 6 below are the historical implementation log for the v0.1
through v0.4 lines. Everything in them is **Shipped** unless a later section
supersedes it.

## Phase 0 — Public foundation (Shipped)

- Public README
- Governance documents
- Security policy
- Architecture and roadmap docs

## Phase 1 — Repository scaffold

- Workspace structure
- TypeScript package skeletons
- Rust Kernel crate skeleton
- Tooling baseline
- Validation scripts
- CI foundation

## Phase 2 — Shared contracts

- JSON schema declarations
- Deterministic TypeScript and Rust generation
- Committed generated outputs
- Drift validation
- Cross-language compatibility checks

## Phase 3 — Kernel and runtime

- Kernel state machine (in place)
- Validation shell (in place)
- Version registry checks (in place)
- Update guard shell (in place)
- Rust test coverage (in place)
- Runtime foundation: injected Kernel boundary, pre-dispatch validation, structured responses, deterministic traces (in place)

## Phase 4 — CLI foundation

- `status` and `doctor` commands (in place)
- Brief, JSON, and markdown output modes (in place)
- Structured execution result for a future binary wrapper (in place)
- No process exit inside CLI core (in place)

## Phase 5 — Context providers, planner, and skills

- Read-only provider interface and registry (in place)
- Normalized provider items (in place)
- Local in-memory provider (in place)
- No external provider integrations yet
- Planner foundation: intent classification, structured context extraction, provider request planning, deterministic task graphs, missing-context responses, runtime request adapter (in place)
- Skills foundation: deterministic skill interface, built-in registry, summarize status, extract risks, derive next tasks, create handoff, review changes (in place)
- Runtime plan execution shell: request-to-planner adapter, planner-driven task graphs, Kernel graph validation before execution, injected read-only provider execution, deterministic skill execution, structured trace and response data (in place)
- CLI plan command: `plan <request>` with brief/JSON/markdown output and Runtime plan request creation (in place)
- Package-level examples: status, doctor, plan, and provider-backed plan through injected Runtime dependencies (in place)
- Private CLI binary wrapper: local `oh-my-pm` bin entry with status/doctor/plan, local provider seed data — no publish or release workflow (in place)
- Real WASM Kernel binding: Rust WASM exports, deterministic build tooling, Node-loadable KernelApi, validation through WASM, update guard through WASM, state transition through WASM, private CLI wrapper using the real Kernel binding (in place)
- Installer foundation: package manifest validation, install manifest/report creation, Kernel-backed install manifest validation, update guard integration, rollback report shell, in-memory deterministic installer state (in place)
- Installer filesystem adapter design: explicit filesystem adapter interface, in-memory filesystem adapter, install dry-run planning, rollback capture planning, path safety validation (in place)
- Read-only Node filesystem adapter: explicit root boundary, recursive listing, file reading, SHA-256 checksums, symlink avoidance (in place)
- Controlled installer execution: explicit write adapter interface, in-memory write adapter, root-confined Node write adapter, execute planned install operations, execute rollback capture operations (in place)
- Installer examples: dry-run planning, controlled in-memory execution, rollback capture, test-only Node adapter demonstration (in place)
- CLI installer preview: `install-preview <root>`, dry-run only, read-only filesystem inspection, planned operations output, brief/json/markdown formatting (in place)
- Release package manifest design: richer package manifest schema, per-file metadata, deterministic manifest construction, manifest validation, planning integration (in place)
- Local package assembly dry-run: explicit include list, read-only file collection, rich manifest generation, missing-file warnings (in place)
- Archive plan design: planned archive name, archive format value, deterministic archive checksum, archive entries, assembly integration (in place)
- Signed release metadata design: metadata schema, deterministic signing payload, placeholder signature shape, metadata validation, CLI preview summary (in place)
- Release integrity verification design: metadata validation, archive-vs-metadata consistency checks, deterministic placeholder signature checks, CLI preview summary (in place)
- Release channel metadata design: local channel metadata, deterministic latest selection, verified release entries, CLI preview summary (in place)
- Local update policy evaluation design: local policy validation, update candidate selection, installed-vs-candidate evaluation, downgrade and integrity rules, CLI preview summary (in place)
- Update impact preview design: impact operation planning (create/replace/remove/unchanged), size/checksum summaries, policy-aware impact dry-run, CLI preview summary (in place)
- Rollback impact preview design: rollback operation planning (restore/remove/missing/unchanged), size/checksum summaries, rollback impact dry-run, CLI preview summary (in place)
- Installer decision report design: aggregated decision over assembly/archive/metadata/integrity/channel/update-policy/update-impact/rollback-impact, blocking vs review reasons, ready/blocked/review-required classification, markdown formatting, CLI preview summary (in place)
- Installer audit event model design: deterministic in-memory event sequence (preview start, section evaluation, decision, completion), event validation, event markdown formatting, CLI preview summary — no log writes, no audit file persistence, no telemetry, no remote retrieval, no install execution, no rollback execution, no write path (in place)
- Installer audit trail export plan design: in-memory export payload rendering (JSON/JSONL/Markdown), export plan (event count, byte size, deterministic fingerprint), export validation, export dry-run, CLI preview summary — no export file writes, no log persistence, no telemetry, no remote retrieval, no install execution, no rollback execution, no write path (in place)
- Guarded installer write capability design: write intent/mode/policy validation, capability evaluation against a decision report and explicit policy (default preview-only, ready-decision and explicit-approval required), capability dry-run, CLI preview summary — no production install command, no write path, no write adapter calls, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Explicit write approval token design: deterministic non-secret token binding intent/root/decision, token validation and matching, capability integration (approval satisfied by boolean or matching token; default preview-only stays blocked), token dry-run, CLI preview summary — no secrets, no keys, no cryptography, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Explicit write execution plan design: install/update/rollback impact-to-step mapping, deterministic planned write steps (kind, path, optional checksum) with contiguous sequences, capability-gated plan reasons, plan dry-run, CLI preview summary — no content, no write adapter calls, no command/destination/execution-result fields, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Write execution confirmation checklist design: deterministic pre-write checklist (intent consistency, decision readiness, capability, execution plan readiness, step presence), ordered failure reasons, checklist dry-run, CLI preview summary — confirmation-only, no content/command/destination/write-adapter/execution-result fields, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Controlled write adapter contract hardening: declared adapter metadata contract (name, capabilities, explicit-approval requirement, rollback-capture support), capability/contract validation, write-step-to-capability mapping, required-capability collection, contract evaluation against confirmation checklist and execution plan, contract dry-run, CLI preview summary — metadata-only, no adapter object/function/method, no adapter calls, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Controlled write execution dry-run envelope design: aggregate every write readiness layer (capability, approval token, execution plan, confirmation checklist, adapter contract) into one non-mutating envelope, deterministic ordered readiness reasons, flat readiness summary, envelope dry-run, CLI preview summary — aggregation-only, no content/command/destination/adapter-object/method/execution-result fields, no adapter calls, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Installer release readiness summary design: aggregate local preview readiness (decision report, audit trail export dry-run, controlled write dry-run envelope) into one summary report with ordered sections, deduped reasons, aggregate ready/blocked/review-required status, flat counts, markdown formatter, readiness dry-run, CLI preview summary — summary-only, no release artifact creation, no publish, no content/command/destination/adapter-object/execution-result fields, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- v0 release candidate checklist design: deterministic 14-item checklist (contracts/public-surface/structure/boundaries/builds/tests/wasm/CLI-smoke validation, release-readiness review, and public hygiene gates) from caller-supplied signals, ordered failure reasons, checklist dry-run, markdown formatter, CLI preview summary — checklist-only, no repository inspection from source, no release artifact creation, no publish, no tags, no content/command/destination/adapter-object/execution-result fields, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Public v0 release notes draft design: deterministic public-safe draft (status/included/safety/not-included/validation/next sections) from the release-candidate checklist and release-readiness reports, ordered blocking reasons, draft dry-run, markdown formatter, CLI preview summary — documentation-only, public-safe (no private provenance), no GitHub release, no tags, no release artifact creation, no publish workflow, no URLs, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Guarded release artifact planning: deterministic 6-item plan (release notes, package manifest, archive plan, release metadata, integrity metadata, channel metadata) from local dry-runs, version/checklist/readiness gates, ordered reasons (no raw source reasons copied), always-false creationAllowed, plan dry-run, markdown formatter, CLI preview summary — planning-only, no artifact creation, no archive creation, no publish workflow, no tags, no GitHub release, no URLs/uploads/downloads, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Guarded local artifact assembly dry-run envelope design: aggregate the guarded release artifact plan and the package assembly, archive, metadata, integrity, and channel dry-runs into one readiness envelope with per-layer readiness flags, ordered reasons (no raw source reasons copied), always-false creationAllowed, envelope dry-run, markdown formatter, CLI preview summary — readiness-only, no artifact creation, no archive creation, no publish workflow, no tags, no GitHub release, no URLs/uploads/downloads, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Guarded artifact creation permission model: permission mode (disabled/dry-run-only/explicit) and policy validation (ready-assembly and explicit-approval required), permission evaluation over the guarded local artifact assembly dry-run envelope with ordered reasons, allowed-only-as-future-signal semantics, always-false creationAllowed, permission dry-run, markdown formatter, CLI preview summary (default dry-run-only, unapproved, never allowed) — evaluation-only, no artifact creation, no archive creation, no publish workflow, no tags, no GitHub release, no URLs/uploads/downloads, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Local artifact creation execution plan design: ordered prepare steps mapped from the guarded release artifact plan items (release notes, package manifest, archive, release metadata, integrity metadata, channel metadata), contiguous sequences, version/permission/assembly/empty-steps gates, ordered reasons (failed step reasons only, no raw source reasons copied), always-false creationAllowed, plan dry-run, markdown formatter, CLI preview summary — planning-only, no artifact creation, no archive creation, no step execution, no publish workflow, no tags, no GitHub release, no URLs/uploads/downloads, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Local artifact creation adapter contract design: declared metadata-only contract (name, text/binary output capability labels, dry-run support, explicit-permission requirement), capability and contract validation, step-kind-to-capability mapping, planned-step required-capability collection (first-occurrence dedupe), contract evaluation against permission and execution plan with ordered reasons, always-false creationAllowed, contract dry-run, markdown formatter, CLI preview summary — metadata-only, no adapter instance, no adapter method calls, no artifact creation, no archive creation, no publish workflow, no tags, no GitHub release, no URLs/uploads/downloads, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry (in place)
- Local artifact creation confirmation checklist design: deterministic 7-item checklist (version, permission allowed, execution plan ready, execution steps present, adapter contract ready, required capabilities present, creation remains disabled) composing the guarded creation permission report, local creation execution plan, and metadata-only adapter contract report, ordered failure reasons (no raw source reasons copied), always-false creationAllowed, checklist dry-run, markdown formatter, CLI preview summary — confirmation-only, no adapter instance, no adapter method calls, no artifact creation, no archive creation, no publish workflow, no tags, no GitHub release, no URLs/uploads/downloads, no production install command, no write path, no install execution, no rollback execution, no remote retrieval, no telemetry

## Phase 5A — Usable local vertical slice

- Markdown project document loading: read-only, root-confined, symlink-safe Node CLI boundary with deterministic file/byte limits (in place)
- `brief [root]`: local Markdown project directory to project status brief (in place)
- Status skill through the Runtime/Planner/Kernel pipeline: brief request, planner task graph, Kernel graph validation, local provider read, summarize-status skill, formatted output (in place)
- Markdown content-to-skill body plumbing: document `data.content` mapped into Runtime skill item bodies so skills inspect document text, not just titles (in place)
- `risks [root]`: local Markdown project directory to document-level risk report with deterministic severity and reason through the extractRisks skill (in place)
- Generic Runtime skill-input semantic routing correction: provider items flow to skills as items only, never auto-declared as explicit tasks/risks/changes (in place)
- Markdown unchecked task extraction: deterministic single-line checkbox parsing in deriveNextTasks with structured open-item fallback (in place)
- `next [root]`: local Markdown project directory to explicit next-task list through the deriveNextTasks skill (in place)
- Deterministic Markdown section extraction: shared pure Skill-layer helper for heading normalization, section parsing (ATX headings, list/checkbox/paragraph content, fenced-code and wrapped-line handling), heading-scoped item collection, unchecked-task collection, and project-title inference; deriveNextTasks and createHandoff share the unchecked-checkbox extraction (in place)
- `handoff [root]`: local Markdown project directory to a deterministic project handoff (project title, Summary, Open Tasks, Risks, Decisions) through the createHandoff skill, with objective/active/milestone summary, unchecked-task, blocker/constraint risk, and decision extraction (in place)
- Local project configuration: optional strict root-level `oh-my-pm.config.json` (JSON only, no upward search, no code execution, no environment reads), read through an explicit read-only Node boundary (in place)
- Include/exclude document rules: dependency-free `*`/`?`/`**` glob subset with exclude precedence, case-sensitive matching, safety limits that may only lower loader defaults, and scanned/matched/excluded/loaded counts, shared by all four workflows (in place)
- Example project fixture: public fictional Markdown project (source tree `examples/fixtures/markdown-project`, shipped in the release bundle at `examples/markdown-project`), with an example config and excluded sentinel documents (in place)
- Read-only MCP stdio server: private `@oh-my-pm/mcp-server` package exposing `project_brief`, `project_risks`, `project_next`, and `project_handoff` over stdio, reusing the CLI config/loader/request/formatter surfaces and the Runtime/Planner/Skills/local-provider/real-WASM pipeline, with strict public structured-result projections and no HTTP, telemetry, or write tools (in place)
- Local preview-first command installation: `tools/install-local.mjs` writes stable `oh-my-pm` and `oh-my-pm-mcp` shims (POSIX + `.cmd`) only under an explicit `<prefix>/bin`, preview by default, `--apply`/`--force` gated, atomic, with no PATH, shell-profile, or client-config edits (in place)
- Local install verification: read-only `tools/check-local-install.mjs` exercises the installed CLI (status + fixture brief) and the installed MCP command over stdio (tool list + `project_brief`) (in place)
- Generic MCP client config generation: read-only `tools/print-mcp-client-config.mjs` prints a stdio client entry with an absolute command path and no env/root/network fields; never writes to a client (in place)
- Getting-started onboarding guide covering clone/build/install/verify, PATH, CLI workflows, and MCP client setup (in place)
- Canonical `0.1.0` version alignment with a read-only version consistency check across manifests, runtime constants, and the Kernel (in place)
- Portable versioned release bundle: preview-first `oh-my-pm-v0.1.0/` assembly (compiled packages, production dependency tree, real WASM Kernel, fixture, deterministic `RELEASE.json`, `SHA256SUMS`) that runs outside the repository on Node.js 20+ with no Rust or pnpm (in place)
- Relocated release bundle verification: read-only checker validating metadata, checksums, CLI workflows, and the MCP server against the bundle's own dependency tree (in place)
- Deterministic release archives: byte-reproducible `oh-my-pm-v0.1.0.tar.gz` and `.zip` plus `SHA256SUMS`, normalized modes/timestamps/ordering, one top-level directory, with a repository-independent archive verifier and a reproducibility checker (in place)
- Manually gated GitHub Release workflow: `workflow_dispatch`-only, `contents: read` top-level, a `contents: write` publish job behind a `publish` boolean, an exact confirmation string, and a protected `github-release` environment (in place)
- Actual `v0.1.0` GitHub Release publication: complete
- Read-only local operation: no write path in package source, no network, no telemetry, no document content persistence (in place)

Next priorities:

1. timeline events as a separate bounded phase
2. provider aliases/profiles only with demonstrated usage
3. controlled write-back only with separate approval

Preview-first installation from an extracted verified release bundle, the
read-only GitHub provider, and finer deterministic risk/task extraction are now
in place (see Phase 5B).

## Phase 5B — v0.2 development

- development baseline opened at `0.2.0-alpha.0`; candidate `0.2.0-rc.1` published and validated; source version now `0.2.0`, **published as the latest stable release** (v0.2 scope frozen; `v0.2.x` maintenance-only)
- self-describing version/bundle/archive verification (in place)
- archive-native preview-first installation from an extracted verified release bundle (in place)
- GitHub read-only provider (in place)
- asynchronous provider/Runtime/CLI/MCP execution boundary (in place)
- finer deterministic risk/task extraction for GitHub and Markdown context (complete)
- provider configuration and diagnostics (complete)
- richer GitHub fetch modes and source selection (complete)
- bounded GitHub item comments for the item source, opt-in and single-page (complete)
- bounded pull-request reviews and review comments for the item source, opt-in, PR-only, single-page (complete)
- cross-platform release-install CI parity: Windows job proves source-bundle independence and prefix relocation, matching POSIX (F-TEST-1 closed on a green Windows run)
- centralized GitHub list limit constants: one canonical source imported by provider config/settings/selection and the CLI parser, behavior-preserving (F-DUP-1 resolved)
- controlled live GitHub smoke against the real REST API using the installed portable artifact: tokenless provider/CLI flows, live PR-item discussion, and installed MCP workflows all passed with bounded, sanitized projections; READY FOR RC PREPARATION (complete — see docs/releases/v0.2-live-github-smoke.md)
- `0.2.0-rc.1` prepared: version promoted across manifests/runtime/Kernel, v0.2 scope frozen, RC release notes + publishing guide added, manually gated `Release v0.2 RC` workflow added, RC bundle/archives rehearsed locally
- `0.2.0-rc.1` published: the manually gated `Release v0.2 RC` workflow was run at `fd03cce…` (dry run `publish=false`, then `publish=true` with the exact confirmation) to create the immutable GitHub **prerelease** (tag `v0.2.0-rc.1`, `draft=false`, `prerelease=true`, exactly three assets). Latest stable remains `v0.1.0`; no stable `v0.2.0` and no registry publication
- `0.2.0-rc.1` post-publication validation: the published prerelease was validated from the public GitHub Release (artifact verification, installation UX, source independence and relocation, the four local workflows on three project shapes, the strict configuration matrix, tokenless live GitHub read-only flows, and all ten stdio MCP tools) — all passed with no Blocker/High/Medium defects. Decision: **GO for stable preparation** (Low-only findings, documented follow-up). See docs/releases/v0.2.0-rc.1-post-publication-validation.md
- `0.2.0` stable prepared: version promoted from `0.2.0-rc.1` to `0.2.0` across `version.json`, all workspace manifests, runtime version constants, and the Rust/WASM Kernel (source diffs limited to version constants); stable release notes finalized (docs/releases/v0.2.0.md); a manually gated `Release v0.2 Stable` workflow (.github/workflows/release-v0.2.yml) and its static policy validator added; the stable bundle/archives/install were rehearsed locally (preview, apply, source removal, prefix relocation, installed ten-tool MCP). No Blocker/High/Medium findings. L4 corrected (current operational docs use the shipped fixture path `examples/markdown-project`); L1 (no CLI `--help`) and L2 (no installed MCP config generator) deferred.
- `0.2.0` stable **published** (complete): the manually gated `Release v0.2 Stable` workflow ([run 30137413934](https://github.com/he8um/oh-my-pm/actions/runs/30137413934)) ran at `2bac37a…` after a separate owner approval through the `github-release` environment's required reviewer (no administrator bypass), creating the non-draft, non-prerelease `v0.2.0` release marked latest with exactly three assets and no registry publication. Published `2026-07-25T01:04:55Z`. `v0.2.0` is now the latest stable; `v0.2.0-rc.1` remains a historical prerelease and `v0.1.0` a historical stable.
- `0.2.0` stable **closed** (complete): the public release was independently verified (checksums, archive, bundle, install, CLI/Kernel `0.2.0`, ten-tool MCP) and the release line was closed. Governance L3 closed (reviewer gate exercised, no bypass); L4 closed; L1/L2 deferred; Blocker/High/Medium = 0. See docs/releases/v0.2.0-post-stable-closure.md.

**v0.2 phase complete.** Governance (L3) is closed: the `github-release` environment had a required reviewer (`he8um`, type User) alongside its preserved custom `main` branch policy, and the stable publication run paused for and received a manual approval (no administrator bypass; `prevent_self_review` stays `false` so a single administrator can approve). Timeline events, aliases/profiles, and write-back remain deferred beyond v0.2.

- **v0.2.x — maintenance only.** The line is bug-fix / security / packaging / docs / CI-reliability only; new features, providers, MCP tools, and v0.3 architecture require a separate, explicit approval. See docs/releases/v0.2.x-maintenance-policy.md. v0.3 development is limited to the approved, non-user-facing foundation (Phases 0, 1, 2, and 3); no v0.3 product is shipped, capture/compare work only programmatically below the CLI, and `version.json` stays `0.2.0`.

## Phase 5C — v0.3 discovery and architecture gate

- **v0.3 discovery and architecture gate: complete.** An evidence-based audit of
  the stable `v0.2.0` product, a scored comparison of four candidate directions,
  and a narrow architecture for the highest-scoring direction were produced as
  documentation only. No source, version, workflow, or release changed; `main`
  remains at source version `0.2.0` and `v0.2.x` stays maintenance-only.
- **v0.3 Phase 0 (contracts and guards): implemented.** Under a separate,
  explicit owner approval for Phase 0 only, the six versioned Project Brain
  contracts (`ProjectIdentity`, `EvidenceRecord`, `ProjectState`,
  `ProjectSnapshot`, `ChangeSet`, `Freshness`) were added as a single
  `projectbrain` contract domain, generated deterministically to TypeScript and
  Rust, covered by contract tests (TS fixtures + a contract-only Rust serde
  round-trip) and by architecture guards in `validate-structure.mjs` /
  `validate-boundaries.mjs`. No persistence, no application-state write, no
  project write, no network path, and no new MCP tool was added; `version.json`
  stays `0.2.0`, the MCP surface stays exactly ten tools, and no v0.2 behavior
  changed. See [phase-0-contracts.md](v0.3/phase-0-contracts.md).
- **v0.3 Phase 1 (deterministic Kernel): implemented.** Under a separate,
  explicit owner approval for Phase 1 only, a pure, deterministic Kernel module
  (`kernel/crate/src/projectbrain/**`) was added: normalization and validation of
  the Phase 0 contracts, network-free identifier derivation, byte-stable canonical
  serialization, SHA-256 content/state/snapshot fingerprints, freshness derivation
  from injected timestamps, exact snapshot matching, and deterministic change
  classification — with golden fixtures under `examples/fixtures/project-brain/**`.
  It reads no clock, filesystem, network, environment, or randomness and performs
  no persistence, application-state write, or project write. `version.json` stays
  `0.2.0`, the MCP surface stays exactly ten tools, the Kernel WASM exports and
  `KernelApi` methods are unchanged, and no v0.2 behavior changed. See
  [phase-1-kernel.md](v0.3/phase-1-kernel.md).
- **v0.3 Phase 2 (local persistence adapter): implemented.** Under a separate,
  explicit owner approval for Phase 2 only, the private, dependency-free
  `@oh-my-pm/project-memory` package and one explicit Node filesystem adapter were
  added: the finalized local JSON storage format (store format `1`), the
  application-data location resolver, atomic temp-then-rename commits with the
  manifest rename as the commit point, domain-separated SHA-256 manifest/record/
  export integrity, immutable snapshot and evidence records, safe reads with
  fail-safe corruption handling, single-writer locking, a migration mechanism
  proven by a synthetic test-only `0 → 1` migration, export, and delete.
  Filesystem writes exist only in the explicit Node adapter boundary. No public
  CLI command, MCP tool, Runtime orchestration, or v0.2 release bundle invokes or
  includes it; no project file is written; there is no network or telemetry. The
  application-state adapter exists but the Project Brain remains user-inaccessible.
  `version.json` stays `0.2.0`, the MCP surface stays exactly ten tools, and no
  v0.2 behavior changed. See [phase-2-persistence.md](v0.3/phase-2-persistence.md).
- **v0.3 Phase 3 (Runtime capture and compare): implemented.** Under a separate,
  explicit owner approval for Phase 3 only, the provider-independent Project Brain
  Runtime API (`runtime/src/projectbrain/**`) was added, wiring read-only
  observation → pure Skills state/evidence derivation → Phase 1 Kernel
  finalization via a new minimal WASM/TypeScript binding for the seven pure
  functions → one Phase 2 memory transaction → Phase 1 deterministic diff. It adds
  no CLI memory command, no MCP tool, no provider change, no provider→memory
  dependency, no project-file write, and no contract or Phase 1/Phase 2 semantic
  change; the existing `Runtime.handle()` behavior and the ten-tool MCP surface
  are unchanged. Capture and compare work only programmatically below the CLI —
  the full vertical slice is proven end-to-end with the real adapter — and the
  Project Brain remains user-inaccessible. `version.json` stays `0.2.0`. See
  [phase-3-runtime.md](v0.3/phase-3-runtime.md).
- **v0.3 Phase 4 (minimal preview-first CLI memory surface): implemented.** Under
  a separate, explicit owner approval for Phase 4 only, the Project Brain vertical
  slice was exposed through the CLI as one new `memory` namespace with exactly six
  preview-first subcommands (`capture`, `changes`, `status`, `history`, `export`,
  `delete`). Mutations default to a zero-write preview and require `--apply`;
  `delete --apply` additionally requires an exact `--confirm <project-id>`. The
  surface uses explicit project identity only, is non-interactive and scriptable,
  supports `--json`/`--markdown` with stable exit codes, composes the Phase 3
  Runtime, and lazily constructs the Phase 2 Node adapter on the memory path only.
  It adds no MCP tool, no provider change, no project-file or config write, no
  automatic project-id generation, and no version bump; `@oh-my-pm/project-memory`
  stays a CLI dev/build-time dependency excluded from the v0.2 release bundle. The
  memory commands run from the source/workspace CLI only and are not available in
  the published v0.2 artifacts; installed-artifact qualification is deferred to
  Phase 6. `version.json` stays `0.2.0`, the MCP surface stays exactly ten tools,
  and no v0.2 behavior changed. See [phase-4-cli.md](v0.3/phase-4-cli.md).
- **v0.3 Phase 4.1 — snapshot capture chronology correction: implemented.** With
  a separate, explicit owner approval for Phase 4.1 only, a semantic defect in the
  Phase 4 baseline was corrected: `memory history` and the default `memory changes`
  comparison used a content-derived, lexically sorted Snapshot-ID order rather than
  actual capture order. The Project Memory manifest gained an authoritative capture
  chronology (internal store format 2; `snapshotHistory` + `snapshotChronologyOrigin`,
  integrity-protected), `snapshotIds` stays a sorted inventory, and a production
  `1 → 2` migration recovers the best deterministic chronology a v1 store can yield
  (reached explicitly through `memory capture --migrate-store`, never on a read).
  The Runtime default comparison now uses real capture order with no lexical
  fallback. No new subcommand, MCP change, contract/Kernel/provider change, project
  write, or version bump; `version.json` stays `0.2.0`, the Project Brain schema
  stays `1`, and the MCP surface stays exactly ten tools. See
  [phase-4-1-snapshot-chronology.md](v0.3/phase-4-1-snapshot-chronology.md).
- **v0.3 Phase 5 — minimal read-only MCP projection: implemented.** With a
  separate, explicit owner approval for Phase 5 only, exactly one bounded,
  sanitized, read-only MCP tool, `project_changes`, was added over
  already-captured Project Brain memory. It reads local application-state and
  compares committed snapshots in Phase 4.1 capture order through the existing
  Runtime compare; it captures nothing, migrates nothing, exports/deletes
  nothing, calls no provider, and touches no network. Its output is a strict
  allowlist (category/kind/id plus optional title/status/severity/dueDate and an
  evidence count) — never raw state, evidence ids, previous/current values, or
  paths. It is registered only when a read-only executor is injected, loaded
  lazily at stdio startup via a dynamic `@oh-my-pm/project-memory` import: the
  source/workspace capability server exposes eleven tools (the historical ten
  plus `project_changes`); the legacy/current v0.2 bundle, which excludes the
  package, starts with the exact ten. Zero MCP write tools; stdio-only; no
  version bump; `@oh-my-pm/project-memory` stays a dev-only workspace dependency
  excluded from the v0.2 release bundle. `version.json` stays `0.2.0`, the MCP
  write-tool count stays zero, and the published `v0.2.0` is untouched. See
  [phase-5-mcp.md](v0.3/phase-5-mcp.md).
- **v0.3 Phase 6 — installed-artifact release qualification and `0.3.0-rc.1`
  preparation: implemented.** With a separate, explicit owner approval for Phase 6
  only, the Project Brain slice was packaged into a self-contained, cross-platform
  release candidate with no product behavior change. `@oh-my-pm/project-memory`
  became a runtime dependency of the CLI and MCP server (both still lazy-import
  it), so `pnpm deploy --prod` bundles it dist-only and the **installed** memory
  commands and `project_changes` tool resolve with no workspace checkout — the
  installed MCP exposes eleven tools. An explicit, self-describing "project-brain"
  release profile in `RELEASE.json` drives profile-aware, fail-closed verifiers;
  the historical v0.2 profile still resolves ten tools. A cross-platform installed
  qualification (`tools/check-v0.3-installed-project-brain.mjs`), a non-publishing
  CI matrix (Ubuntu/macOS/Windows), and a manually gated, prerelease-only RC
  workflow were added, and `version.json` was promoted to `0.3.0-rc.1`. See
  [phase-6-release-qualification.md](v0.3/phase-6-release-qualification.md).
- **`0.3.0-rc.1` published.** The manually gated `Release v0.3 RC` workflow was
  run at `1db4057…` (dry run `publish=false`, then `publish=true` with the exact
  confirmation) to create the immutable GitHub **prerelease** (tag `v0.3.0-rc.1`,
  `draft=false`, `prerelease=true`, not marked latest, exactly three assets, no
  registry publication). Latest stable remains `v0.2.0`.
- **`0.3.0-rc.1` post-publication validation: GO.** The published prerelease was
  validated from its public GitHub Release assets (checksums, archive, both
  extractions, profile, installer/relocation, the full CLI journey, the eleven-tool
  MCP surface and `project_changes` lifecycle, migration, corruption, concurrency,
  privacy) — 162/162 installed-qualification checks on both archives, with green
  CI on Linux/macOS/Windows. Only Low-severity documentation-truthfulness findings.
  Decision: **GO FOR v0.3.0 STABLE PREPARATION**. See
  [v0.3.0-rc.1-post-publication-validation.md](releases/v0.3.0-rc.1-post-publication-validation.md).
- **v0.3 Phase 7 — stable qualification and `0.3.0` preparation: implemented.**
  Under a separate, explicit owner approval, the validated candidate was promoted
  `0.3.0-rc.1 → 0.3.0` across all version surfaces (no product semantics change),
  stable release notes / publishing runbook / installed getting-started / Phase 7
  report were added, public documentation was corrected, and a manually gated
  `Release v0.3 Stable` workflow (`.github/workflows/release-v0.3.yml`) was added.
  `v0.3.0` is **prepared but not published as stable** — no `v0.3.0` tag or stable
  release exists, `releases/latest` remains `v0.2.0`, and publication is a
  separate, explicitly authorized action. See
  [phase-7-stable-qualification.md](v0.3/phase-7-stable-qualification.md).
- **Selected North Star:** OH MY PM can capture a project observation locally,
  preserve minimized evidence, compare it with the previous observation, and
  return deterministic changes — without modifying the project or uploading its
  content.
- **Selected direction:** Project Brain Foundation (canonical project state,
  evidence ledger, immutable snapshots, deterministic change engine, freshness,
  local persistence, export/delete). Distribution/UX, MCP intelligence, and more
  integrations are deferred and sequenced to follow, each unblocked by the state
  foundation. The single new capability is an explicit, local, user-controlled
  application-state write boundary; project-file writes remain prohibited and no
  content is uploaded.
- See [the v0.3 project brain foundation](v0.3/README.md) for the full discovery,
  data model, architecture, threat model, phased plan, acceptance gates, and the
  formal GO scope decision.

## Phase 5D — v0.4 Project Timeline (Shipped)

- **Shipped and published.** Every phase is implemented and green: the bounded
  contracts and deterministic Kernel derivation, the read-only Runtime query, the
  `memory timeline` CLI subcommand, the `project_timeline` MCP tool, the extended
  profile-aware installed qualification (428/428 checks from each archive,
  including direct v0.3.1 store compatibility), and the promoted `0.4.0` version
  with a manually gated `Release v0.4 Stable` workflow. **`v0.4.0` was published
  and is the current `releases/latest`.** See the
  [v0.4.0 release notes](releases/v0.4.0.md), the
  [publishing runbook](releases/publishing-v0.4.0.md), and the
  [timeline walkthrough](v0.4/getting-started-timeline.md).
- **Scope and architecture: locked.** v0.4 builds exactly one capability —
  **Project Timeline**: a local, bounded, deterministic history of project changes
  derived from already-committed Project Brain snapshots, in authoritative capture
  order, exposed through one new CLI subcommand and one new read-only MCP tool.
- **North Star:** OH MY PM can answer "what changed in this project, and when?"
  from local committed memory alone — deterministically, bounded and filterable,
  without capturing anything, writing anything, or uploading anything.
- **Deliverables:** three bounded contracts (`TimelineEvent`, `TimelineQuery`,
  `TimelineResult`); one pure deterministic derivation over adjacent committed
  snapshots reusing the existing Kernel change engine; one read-only,
  provider-independent Runtime timeline query; the seventh memory subcommand
  `memory timeline`; the twelfth read-only MCP tool `project_timeline`; installed
  compatibility/limits/privacy/failure qualification; and a gated stable
  `v0.4.0` release.
- **Unchanged by v0.4:** Project Brain schema stays `1`, store format stays `2`,
  no migration is required, MCP stays stdio-only with **zero** write tools, no
  project file is written, no project content is uploaded, and there is no
  registry publication. A store created by the public `v0.3.1` build is read
  directly with no migration.
- **Deferred beyond v0.4:** persisted timeline events, timeline editing,
  controlled write-back, automatic/background capture, watchers, cloud sync,
  telemetry, dashboards, semantic/vector search, LLM-generated summaries, provider
  aliases/profiles, and multi-workspace aggregation.
- See [the v0.4 project timeline](v0.4/README.md) for the locked scope, event
  model, ordering, query and pagination model, privacy allowlist, corruption
  behavior, compatibility matrix, CLI/MCP surfaces, validation gates, and release
  invariants.

## v0.5.0 — CLI command namespace (Prepared but unpublished)

- **Canonical commands:** `ohmypm`, `ohmypm-mcp`, `ohmypm-install`.
- **Deprecated compatibility aliases:** `oh-my-pm`, `oh-my-pm-mcp`,
  `oh-my-pm-install`. Each forwards to the same implementation after a
  stderr-only deprecation warning. **No removal is scheduled.**
- **Not a product rename.** The product name, repository, package scope
  `@oh-my-pm/*`, environment prefix `OH_MY_PM_*`, Rust identifiers, installation
  directory `lib/oh-my-pm/`, release archives `oh-my-pm-vX.Y.Z`, project config
  filename, data directories, MCP server key `oh-my-pm`, and error-code namespace
  are all unchanged.
- **No data migration.** Project Brain schema stays 1 and store format stays 2; a
  v0.4 store is read directly.
- **Single source of truth:** `command-surface.json`, enforced by
  `pnpm validate:commands` and `pnpm validate:references`.
- **Release line `v0.5`, bundle profile `ohmypm-cli-namespace`** — same runtime
  surface as v0.4 (twelve read-only MCP tools, seven memory subcommands, zero
  write tools).
- **Explicitly not in v0.5:** any Dashboard work, any new feature, any CLI
  hierarchy change, and any change to behavior, schemas, output contracts, storage
  formats, or MCP protocol behavior.
- **Never published.** The v0.5.0 work merged to `main`, but no `v0.5.0` tag or
  GitHub release exists. It is superseded by v0.5.1, which became the first
  published stable of the v0.5 line.
- See [the v0.5 command namespace guide](v0.5/README.md) for the migration
  behavior, upgrade path, and deprecation policy.

## v0.5.1 — Documentation truth and the application boundary (Shipped)

- **Patch release. No public behavior change.** No new command, no changed CLI
  syntax or JSON output, no changed MCP tool, schema, or annotation, no Project
  Brain schema change, no Project Memory format change, no storage path change,
  and no migration.
- **Documentation truth.** Active documents, comments, and current-state claims
  were brought into agreement with the shipped product. Historical documents
  (`docs/releases/**`, `docs/v0.3/**`, `docs/v0.4/**`, the v0.2 stabilization
  audit, and superseded CHANGELOG entries) remain historically accurate and were
  deliberately left alone. Enforced by `pnpm validate:docs`.
- **Shared application boundary.** `@oh-my-pm/application` now owns the reusable
  project, provider, and Project Memory use cases. CLI and MCP consume the same
  typed use cases, and the MCP server no longer depends on `@oh-my-pm/cli`.
- **Release line `v0.5`, bundle profile `ohmypm-cli-namespace`** — retained
  unchanged, because the user-facing runtime surface is unchanged.
- **First published stable of the v0.5 line.** v0.5.1 supersedes the unpublished
  0.5.0 candidate and is now the immutable base lineage for v0.5.2.
- **Explicitly not in v0.5.1:** any Dashboard, web UI, HTTP server, or API; any
  new command, MCP tool, provider, or schema change; and any registry
  publication.
- See [the v0.5.1 scope](v0.5/v0.5.1-scope.md) and
  [the application boundary](v0.5/application-boundary.md).

## v0.5.2 — The shared GitHub application boundary (Shipped)

- **Patch release. No public behavior change.** No new command, no changed CLI
  syntax or JSON output, no changed MCP tool, schema, annotation, or tool order,
  no Project Brain schema change, no Project Memory format change, no storage
  path change, and no migration.
- **One shared GitHub use case.** `@oh-my-pm/application` owns GitHub workflow
  sequencing, effective provider settings, repository validation, source
  selection, limit resolution, fail-closed ordering, Runtime composition, request
  construction, and output extraction. The CLI and MCP GitHub adapters consume it
  instead of each rebuilding the Runtime pipeline, and neither composes a Kernel,
  Runtime, provider registry, skill registry, or Node transport any more.
- **Node composition behind the application Node boundary.**
  `@oh-my-pm/application/node` owns the provider-config load, the optional token
  environment read, platform/cwd resolution, real transport construction, and
  real clock access. The token read is lazy: a controlled failure reads no token,
  opens no transport, and reads no clock.
- **One canonical MCP version.** The stale independent
  `MCP_GITHUB_RUNTIME_VERSION = "0.3.0"` is removed; every MCP surface derives
  from `OH_MY_PM_MCP_VERSION`.
- **Release line `v0.5`, bundle profile `ohmypm-cli-namespace`** — retained
  unchanged, because the user-facing runtime surface is unchanged.
- **Published.** `v0.5.2` is the latest published stable release, targeting
  `6c915e0…`. `v0.5.1` remains published and immutable as the base lineage it
  was released from.
- **Explicitly not in v0.5.2:** any Dashboard, web UI, HTTP server, or API; any
  new command, MCP tool, provider, or schema change; any GitHub mutation
  capability; and any registry publication.
- **v0.5.2 maintenance scope complete:** documentation and governance truth
  (#30), CI and quality policy (#32), and CODEOWNERS and hosted protections
  (#33) are all closed.
- See [the v0.5.2 release notes](releases/v0.5.2.md),
  [the publishing runbook](releases/publishing-v0.5.2.md), and
  [the post-publication validation record](releases/v0.5.2-post-publication-validation.md).

## Phase 6 — Release lifecycle

- Version registry
- Update guard
- Rollback model
- Release gates

## v0.5.3 — Documentation and architecture truth (Shipped)

**Published as the latest stable release** on 2026-08-02 (tag `v0.5.3`, targeting
`fa50d0e…`). No product code changes; no public behavior changes.

- **Documentation authority is machine-readable.** `docs/manifest.json` classifies
  every tracked document exactly once with `status` (`active`, `historical`,
  `superseded`, `release-record`), `authority` (`normative`, `informative`),
  `appliesTo`, `replacement`, and the `concern` it is authoritative about.
  `tools/docs-manifest.mjs` is the single loader, so the validator and the
  inventory tool cannot disagree.
- **The validator derives rather than restates.** `pnpm validate:docs` reads its
  active and historical sets from the manifest, replacing the two hard-coded
  arrays that previously encoded them.
- **Four new drift guards:** an active document naming a nonexistent
  `@oh-my-pm/*` package; a real workspace package omitted from the authoritative
  package map; a `superseded` document still Markdown-linked from an active
  normative document; and two active normative documents claiming one `concern`.
  Both package expectations derive from `pnpm-workspace.yaml`.
- **Full classification coverage.** Every tracked Markdown document must be
  classified or explicitly excluded, closing the gap where a new document
  defaulted to unclassified and therefore unchecked.
- **Deterministic inventory tooling.** `pnpm docs:inventory` reports active,
  historical, superseded, release records, broken replacements, and unclassified
  documents; `pnpm docs:inventory:check` fails CI on any defect.
- **Two real corrections.** The README no longer describes the repository as a
  "new v2 line" — it ships `v0.x` and has no `v2.x` target — and
  `docs/architecture.md` now documents `@oh-my-pm/examples`, the development-only
  composition harness it had omitted.
- **Historical evidence preserved.** No file under `docs/releases/**`,
  `docs/v0.3/**`, `docs/v0.4/**`, or `docs/architecture/**` is edited.
  `CHANGELOG.md` is classified as a release record so its accurate past claims
  are not rewritten to today's numbers.
- **Explicitly not in v0.5.3:** any Dashboard, web UI, or HTTP server; the `omp`
  command migration; new providers; cloud sync; telemetry; or GitHub mutation.
- See [the v0.5.3 release notes](releases/v0.5.3.md) and
  [the post-publication validation record](releases/v0.5.3-post-publication-validation.md).

## v0.5.4 — Contract and repository consistency (Planned)

The next patch in the v0.5 line. It makes repository boundaries and shared
contracts explicit and mechanically enforced:

- an authoritative package catalog giving every workspace a role,
  responsibilities, allowed and forbidden dependencies, and release-bundle
  status;
- a verified, cycle-free dependency graph with strengthened boundary validation;
- a shared `ApplicationResult<T>` envelope at the application boundary consumed
  by both CLI and MCP;
- normalized source descriptors and provenance contracts carrying no secrets;
- a unified `Diagnostic` model and a repository-wide error taxonomy,
  consolidating today's per-use-case structures in `application/src/errors.ts`
  and `application/src/provider-diagnostics.ts`;
- explicit, tested CLI exit-code and MCP error mapping;
- semantic parity tests proving CLI and MCP consume the same application result
  for the same fixture.

It preserves current public CLI output, MCP tool schemas and order, compatibility
aliases, and Project Memory formats.

## v0.6 — Core and public surface (Planned)

The candidate scope is the canonical command migration — making `omp` canonical
while retaining compatibility aliases — together with whatever public-surface
consolidation the v0.5.4 contracts enable. Nothing here is committed, designed,
or implemented. The v0.5 patches deliberately do not begin it: `ohmypm` remains
the canonical command in v0.5.3 and v0.5.4.

## Beyond v0.6 — Local Project Dashboard (Planned)

A local read-only Dashboard over the same application use cases the CLI and MCP
server consume. The v0.5 patches establish the `@oh-my-pm/application` boundary it
would depend on; nothing about the Dashboard itself is designed or implemented,
and no release in the v0.5 line — v0.5.3 and v0.5.4 included — contains any
Dashboard, web UI, HTTP server, or UI dependency.

## Out of scope

Cloud sync, user accounts, telemetry, remote analytics, GitHub mutation, an HTTP
MCP transport, and npm registry publication.
