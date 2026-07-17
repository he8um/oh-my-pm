# Changelog

## [Unreleased]

### Changed

- Opened the `0.2.0-alpha.0` development line.
- Generalized version, bundle, and archive verification around self-describing metadata.

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
