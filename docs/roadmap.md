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

## Phase 5 — Context providers and skills

- Read-only provider interface and registry
- Normalized provider items
- Local in-memory provider
- No external provider integrations yet
- Deterministic skill registry
- Initial project-management transformations

## Phase 6 — Release lifecycle

- Version registry
- Update guard
- Rollback model
- Release gates

## Future

A local dashboard may be added after the core command-line and validation surfaces are stable.
