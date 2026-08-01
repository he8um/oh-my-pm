# @oh-my-pm/runtime

Request orchestration for OH MY PM.

The package exposes two separate surfaces.

## Request Runtime

`createRuntime()` and `Runtime.handle()` orchestrate a single deterministic
request over the Kernel, the provider registry, and the skill registry.
`handle()` dispatches exactly three request kinds — `status`, `doctor`, and
`plan` — and falls through on anything else. It never reads a clock, the
environment, or the filesystem: every non-deterministic input is injected.

## Project Brain Runtime

`createProjectBrainRuntime()` is the separate capture, comparison, and timeline
API over Project Brain memory. Shipped since v0.3.0, it is reached through the
application layer's memory orchestrator, which backs the seven `ohmypm memory`
subcommands and the read-only `project_changes` and `project_timeline` MCP
tools.

It never imports `@oh-my-pm/project-memory` directly: persistence is reached
only through the structural `ProjectMemoryPort`, so the Runtime stays pure and
the persistence adapter stays replaceable. `tools/validate-boundaries.mjs`
enforces that rule.

Both surfaces are consumed through [`@oh-my-pm/application`](../application/README.md),
never directly by a presentation package.
