# @oh-my-pm/distribution

Private portable distribution package for OH MY PM. It provides the portable command entrypoints used by the versioned release bundle:

- `oh-my-pm` — the local read-only CLI (`brief`, `risks`, `next`, `handoff`, `status`, `doctor`, `plan`)
- `oh-my-pm-mcp` — the local read-only MCP stdio server
- `oh-my-pm-install` — the preview-first release-bundle installer

All three entrypoints are thin process adapters. The CLI and MCP commands run over the compiled workspace packages and the real Rust/WASM Kernel. The installer entrypoint (`bin/oh-my-pm-install.mjs`) infers its own bundle root and delegates to the shared install core at `libexec/release-install-core.mjs`; that core holds all installation planning, validation, rendering, and controlled prefix writes. This package is private and is not published; it exists to define the production dependency surface that the release bundler deploys.

A bundle produced from this package runs on Node.js 20+ with no Rust, pnpm, or repository checkout required. It is local-only and read-only with respect to project data: it never modifies project files, uploads project context, emits telemetry, or exposes an HTTP endpoint. The installer writes only under an explicit `--prefix`, is preview-first, requires `--apply` to write, replaces only exact managed targets under `--force`, and never edits PATH, shell profiles, or MCP client configuration.

See [the getting-started guide](../docs/getting-started.md) and [the v0.1.0 release notes](../docs/releases/v0.1.0.md).
