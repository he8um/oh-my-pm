# Changelog

## [Unreleased]

### Added

- Portable release bundles now contain a preview-first self-installer that creates a versioned, source-independent local installation under an explicit prefix.
- A strictly read-only, explicitly opt-in GitHub provider for repository metadata, issues, and pull requests.
- GitHub-backed brief, risks, next, and handoff workflows in CLI and MCP.

### Changed

- Opened the `0.2.0-alpha.0` development line.
- Generalized version, bundle, and archive verification around self-describing metadata.
- Provider, Runtime, CLI, and MCP execution boundaries are asynchronous to support real read-only network providers.

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
