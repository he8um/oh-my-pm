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
- Archive plan design: planned archive name, archive format value, deterministic archive checksum, archive entries, assembly integration — no archive creation, no publishing, no downloads

## Phase 6 — Release lifecycle

- Version registry
- Update guard
- Rollback model
- Release gates

## Future

A local dashboard may be added after the core command-line and validation surfaces are stable.
