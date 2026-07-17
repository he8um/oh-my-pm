# @oh-my-pm/distribution

Private portable distribution package for OH MY PM. It provides the two portable command entrypoints used by the versioned release bundle:

- `oh-my-pm` — the local read-only CLI (`brief`, `risks`, `next`, `handoff`, `status`, `doctor`, `plan`)
- `oh-my-pm-mcp` — the local read-only MCP stdio server

Both entrypoints are thin process adapters over the compiled workspace packages and the real Rust/WASM Kernel. This package is private and is not published; it exists to define the production dependency surface that the release bundler deploys.

A bundle produced from this package runs on Node.js 20+ with no Rust, pnpm, or repository checkout required. It is local-only and read-only: it never modifies project files, uploads project context, emits telemetry, or exposes an HTTP endpoint.

See [the getting-started guide](../docs/getting-started.md) and [the v0.1.0 release notes](../docs/releases/v0.1.0.md).
