# Roadmap

## Phase 0 — Public foundation

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
- Example project fixture: public fictional Markdown project under `examples/fixtures/markdown-project`, with an example config and excluded sentinel documents (in place)
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

1. GitHub read-only provider
2. finer risk/task extraction
3. controlled write-back only in a later separately approved safety phase

Preview-first installation from an extracted verified release bundle is now in place (see Phase 5B).

## Phase 5B — v0.2 development

- development baseline `0.2.0-alpha.0` (in place)
- self-describing version/bundle/archive verification (in place)
- archive-native preview-first installation from an extracted verified release bundle (in place)
- GitHub read-only provider (next priority)

## Phase 6 — Release lifecycle

- Version registry
- Update guard
- Rollback model
- Release gates

## Future

A local dashboard may be added after the core command-line and validation surfaces are stable.
