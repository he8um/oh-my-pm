# @oh-my-pm/distribution

Private portable distribution package for OH MY PM. It provides the portable command entrypoints used by the versioned release bundle:

- `oh-my-pm` — the read-only CLI (`brief`, `risks`, `next`, `handoff`, `github`, `status`, `doctor`, `plan`)
- `oh-my-pm-mcp` — the read-only MCP stdio server (four local + four GitHub tools)
- `oh-my-pm-install` — the preview-first release-bundle installer

All three entrypoints are thin process adapters. The CLI and MCP commands run over the compiled workspace packages and the real Rust/WASM Kernel. The installer entrypoint (`bin/oh-my-pm-install.mjs`) infers its own bundle root and delegates to the shared install core at `libexec/release-install-core.mjs`; that core holds all installation planning, validation, rendering, and controlled prefix writes. This package is private and is not published; it exists to define the production dependency surface that the release bundler deploys.

A bundle produced from this package runs on Node.js 20+ with no Rust, pnpm, or repository checkout required. It never modifies project files, never uploads local project context, emits no telemetry, and exposes no HTTP endpoint. The local Markdown workflows are fully offline. The only network access is the explicitly invoked, read-only `github` command/tool, which issues `GET`-only requests to `api.github.com`; the optional `OH_MY_PM_GITHUB_TOKEN` is read only at that boundary and never persisted or printed. The installer itself is network-free: it writes only under an explicit `--prefix`, is preview-first, requires `--apply` to write, replaces only exact managed targets under `--force`, and never edits PATH, shell profiles, or MCP client configuration.

See [the getting-started guide](../docs/getting-started.md) and [the v0.1.0 release notes](../docs/releases/v0.1.0.md).
