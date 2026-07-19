# Changelog

## [Unreleased]

### Added

- Optional, bounded GitHub item comments: the `item` source can now include an issue or pull request's ordinary conversation comments (`--include-comments` / `--comment-limit`, and `includeComments` / `commentLimit` for the MCP GitHub tools). Comments are disabled by default, limited to one page of at most 50, and only ordinary issue/PR comments are fetched — never review comments, reviews, timeline events, or diffs. See [docs/providers/github-item-comments.md](docs/providers/github-item-comments.md).
- Portable release bundles now contain a preview-first self-installer that creates a versioned, source-independent local installation under an explicit prefix.
- A strictly read-only, explicitly opt-in GitHub provider for repository metadata, issues, and pull requests.
- GitHub-backed brief, risks, next, and handoff workflows in CLI and MCP.
- Source-aware, line-level deterministic risk extraction for Markdown and GitHub context.
- Deterministic next-task extraction from Markdown action structures and actionable GitHub issues/pull requests.
- English and Persian project-signal headings and markers.
- Strict read-only provider configuration with optional GitHub defaults and enable/disable control.
- Offline provider status/doctor commands and explicitly confirmed GitHub access diagnostics.
- MCP provider status and GitHub diagnostic tools.
- Explicit GitHub source selection for repository overview, repository-only, issues, pull requests, one specific item, and repository-scoped search.
- GitHub workflow state selection for open, closed, or all items.
- Configurable default GitHub source and state.

### Changed

- Opened the `0.2.0-alpha.0` development line.
- GitHub CLI and MCP workflows now route through a single strict source-selection model while preserving the existing overview/open behavior by default.
- Generalized version, bundle, and archive verification around self-describing metadata.
- Provider, Runtime, CLI, and MCP execution boundaries are asynchronous to support real read-only network providers.
- Runtime preserves selected provider provenance for Skill execution without passing raw provider data.
- Risk and next-task output includes optional public provenance, ownership, due-date, and priority metadata.
- GitHub CLI and MCP workflows may resolve repository and limit defaults from provider configuration.
- Live GitHub CLI and MCP workflows read the current time once at the process/tool-call boundary so overdue classification stays correct; local workflows keep a fixed deterministic clock.

### Fixed

- Portable release bundle assembly now stages the complete generated Kernel binding consistently across Windows and POSIX environments.
- Windows release installation no longer fails because the generated Node WASM glue file is omitted by deployment packaging.
- Release installation verification is now platform-aware: because the installer intentionally does not set POSIX executable-mode bits on Windows, exact-state detection and post-install verification no longer require those bits on Windows, while still requiring them on Linux and macOS. Bundle-content and checksum verification, the exact four-shim content check, the transactional apply, and rollback are all unchanged. Windows installs no longer fail with `post_install_verification_failed`.
- The read-only installed-state verifier now launches the installed runtime safely on Windows. Because the Windows shims are `.cmd` files that Node cannot spawn without a shell, the verifier launches the installed CLI and MCP `.mjs` entrypoints directly with the Node executable as an argument vector (no shell, no constructed command string), while POSIX continues to use the installed executable shims. The four shims remain validated byte-for-byte and the direct `.cmd` status smoke is retained. Installed-state verification no longer fails on Windows.

## 0.1.0

### Added

- Local read-only Markdown project brief workflow
- Deterministic project risk extraction
- Unchecked Markdown next-task extraction
- Deterministic project handoff generation
- Root-level project document configuration with include/exclude rules
- Local stdio MCP server with four read-only tools
- Preview-first repository-local installation and verification
- Portable versioned release bundle assembly and verification
- Deterministic `tar.gz` and `zip` release archives with reproducible SHA-256 checksums
- Repository-independent release archive verification and reproducibility checks
- Manually gated GitHub Release workflow prepared (not yet published)

### Safety and privacy

- No project file writes
- No context upload
- No telemetry
- No HTTP MCP transport
- No external provider integration in v0.1.0
