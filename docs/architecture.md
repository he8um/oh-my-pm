# Architecture

OH MY PM is planned as a local-first project intelligence system with strict boundaries between control, orchestration, planning, context, transformation, and validation.

## Layer overview

| Layer | Role |
| --- | --- |
| Kernel | Pure validation and lifecycle control |
| Runtime | Request orchestration |
| Planner | Task planning and dependency shaping |
| Context Providers | Read-only project context adapters |
| Skills | Deterministic project-management transformations |
| CLI | User command surface |
| Installer | Local installation and update lifecycle |
| Validation | Repository, boundary, and release checks |

## Design principles

- Keep core logic local.
- Keep external integrations read-only.
- Keep project state explicit and validated.
- Keep release transitions controlled.
- Keep generated and derived artifacts reproducible.

## Current status

The architecture is being implemented incrementally. The first implementation stage is the repository scaffold and shared contracts foundation.
