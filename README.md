# OH MY PM

**OH MY PM** is a local project intelligence system for structured project and product delivery.

It is designed for teams that want clearer delivery context, safer execution boundaries, and repeatable validation around project work.

> Status: early foundation phase.

---

## What this repository is

This repository contains the new v2 line of OH MY PM.

The previous v1 line is maintained separately as a legacy reference. This repository is a clean rebuild with a new architecture and release line.

---

## Product direction

OH MY PM focuses on one practical delivery problem:

> Given a project, what should be done next, what context matters, what boundaries apply, and how should the result be validated?

The project is local-first, validation-first, and designed to keep project execution explicit instead of relying on scattered notes, undocumented assumptions, or manual coordination.

---

## Architecture

The planned architecture is organized around these parts:

| Area | Responsibility |
| --- | --- |
| Kernel | Pure control plane for validation, state, feature flags, and update safety |
| Runtime | Request orchestration and execution flow |
| Planner | Task planning and dependency shaping |
| Context Providers | Read-only project context integrations |
| Skills | Deterministic project-management transformations |
| CLI | User-facing command surface |
| Installer | Local installation and update lifecycle |
| Validation | Structure, boundary, fixture, and release checks |
| Release Lifecycle | Controlled release state transitions |

See [`docs/architecture.md`](docs/architecture.md).

---

## Current phase

The repository scaffold, shared contracts, Kernel foundation, Runtime foundation, CLI status/doctor foundation, and provider framework foundation are in place. The current focus is the Planner foundation.

Implementation will begin with:

1. repository scaffold
2. shared contracts package
3. Kernel and runtime foundation
4. CLI foundation
5. read-only context provider framework
6. validation and release lifecycle

See [`docs/roadmap.md`](docs/roadmap.md).

---

## Security model

The intended security posture is:

- local-first by default
- no telemetry by default
- no secrets in repository files, logs, issues, examples, or fixtures
- read-only external context integrations
- explicit user-controlled setup for any external connection

See [`docs/security-model.md`](docs/security-model.md) and [`SECURITY.md`](SECURITY.md).

---

## Contributing

This repository is early-stage. Public contributions should focus on documentation, architecture, security, and narrowly scoped implementation work once the scaffold is in place.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening an issue or pull request.

---

## License

MIT © 2026 AmirHesam Piri
