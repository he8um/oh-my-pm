# Changelog

## [Unreleased]

## [0.2.0] - 2026-07-24

Stable `v0.2.0`, consolidating the validated `v0.2.0-rc.1` release candidate.
Prepared on `main`; the stable tag and GitHub Release are created only by the
manually gated `Release v0.2 Stable` workflow after a separate explicit
approval. No feature, command, provider, Skill, MCP tool, Kernel, extraction,
installer, archive, or runtime behavior changed relative to `v0.2.0-rc.1` — only
the version string moved from `0.2.0-rc.1` to `0.2.0`.

### Added

- Read-only, explicitly opt-in GitHub provider for repository metadata, issues,
  and pull requests: `GET`-only against a fixed `api.github.com` origin, fixed
  REST API version, single page per request, optional environment-only token.
- GitHub-backed `brief`, `risks`, `next`, and `handoff` workflows in the CLI
  (`github …`) and MCP (`github_project_*`).
- Six explicit GitHub source modes: `overview`, `repository`, `issues`,
  `pull-requests`, a single `item` (issue/PR with type auto-detection), and
  repository-scoped `search`, each with `open`/`closed`/`all` state and search
  `kind` filtering.
- Bounded, default-disabled GitHub item comments for the `item` source
  (`--include-comments`/`--comment-limit`, and `includeComments`/`commentLimit`
  in MCP): one page of at most 50 ordinary issue/PR conversation comments.
- Bounded, default-disabled pull-request review submissions and inline review
  comments for a pull-request `item` (`--include-reviews`/`--review-limit`,
  `--include-review-comments`/`--review-comment-limit`, and the corresponding
  MCP options): one page of at most 20 each.
- Source-aware, line-level deterministic risk, next-task, and decision
  extraction for Markdown and GitHub context, with English and Persian headings
  and markers.
- Strict read-only provider configuration (`providers.json`) with optional
  GitHub defaults and enable/disable control; offline `providers status` and an
  explicitly confirmed `providers doctor` diagnostic.
- MCP `provider_status` and `github_provider_diagnostics` tools, for an exact
  ten-tool stdio surface.
- Portable release bundles ship a preview-first self-installer that creates a
  versioned, source-independent, relocatable local installation under an
  explicit prefix.

### Changed

- GitHub CLI and MCP workflows route through a single strict source-selection
  model while preserving the default `overview` + `open` behavior.
- Provider, Runtime, CLI, and MCP execution boundaries are asynchronous to
  support real read-only network providers; local workflows stay offline.
- Risk and next-task output includes optional public provenance, ownership,
  due-date, and priority metadata; GitHub item summaries report sanitized review
  and review-comment metadata without exposing bodies, diff hunks, or commit
  identifiers.
- Live GitHub CLI and MCP workflows read the current time once at the
  process/tool-call boundary; local workflows keep a fixed deterministic clock.
- Centralized the GitHub list limit constants (minimum 1, default 50, maximum
  100) into one canonical source; behavior-preserving.
- Generalized version, bundle, and archive verification around self-describing
  metadata.

### Hardening and validation

- Cross-platform release-install CI parity: the Windows release-install job
  (like the POSIX job) verifies a release installation survives deleting the
  extracted source bundle and moving the complete installed prefix, re-running
  the installed CLI and read-only installed-state verification (which exercises
  the installed MCP) after each operation.
- Controlled, read-only live GitHub smoke through the installed portable
  artifact: tokenless provider/CLI flows and the installed stdio MCP live
  workflows (all four GitHub tools, exact ten-tool order) passed with bounded,
  sanitized projections and no forbidden discussion data.
- Post-publication validation of the published `v0.2.0-rc.1` prerelease from its
  public assets passed with no Blocker/High/Medium defects and a GO decision for
  stable preparation.

### Fixed

- Portable release bundle assembly stages the complete generated Kernel binding
  consistently across Windows and POSIX, closing a Windows-only packaging gap
  where the generated Node WASM glue file was omitted.
- Release installation verification is platform-aware: POSIX executable-mode
  bits are required on Linux and macOS but not on Windows, so Windows installs
  no longer fail with `post_install_verification_failed`.
- The read-only installed-state verifier launches the installed runtime safely
  on Windows by invoking the `.mjs` entrypoints directly with the Node
  executable (no shell), while POSIX continues to use the installed shims.

### Security and privacy

- No project file writes; no context upload; no telemetry; stdio-only MCP
  transport; no HTTP MCP transport.
- GitHub access is explicit, read-only, and `GET`-only; the optional token is
  environment-only and never printed, persisted, or accepted as an argument.
- No raw comment/review/review-comment bodies, diff hunks, or commit identifiers
  are exposed through the MCP projections.
- All packages remain private; no registry publication.

### Known non-blocking follow-ups

- L1 — no conventional CLI `--help` surface (deferred beyond `v0.2.0`).
- L2 — no installed MCP client-config generator (deferred to distribution/UX).
- L3 — `github-release` environment required-reviewer governance (remediated as
  a pre-publication gate; see the stable publishing guide).
- L4 — stale fixture-path reference corrected in current operational
  documentation to the shipped path `examples/markdown-project`.

## [0.2.0-rc.1] - 2026-07-24

First `v0.2` release candidate. Prepared on `main` and subsequently published as
an immutable GitHub prerelease (tag `v0.2.0-rc.1`, `draft=false`,
`prerelease=true`); the latest stable release remained `v0.1.0` and no registry
artifact was published.

### Added

- Explicit, bounded pull-request review submissions and inline review comments for GitHub item workflows in CLI and MCP (`--include-reviews` / `--review-limit` and `--include-review-comments` / `--review-comment-limit`, and `includeReviews` / `reviewLimit` / `includeReviewComments` / `reviewCommentLimit` for the MCP GitHub tools). Disabled by default, available only for the `item` source and only when the item is a pull request, one page of at most 20 each, and never fetching timeline events, thread resolution, reactions, diffs, files, or commits. See [docs/providers/github-pr-reviews.md](docs/providers/github-pr-reviews.md).
- Deterministic review-state and explicit Markdown-derived risk, task, and handoff signals.
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

- GitHub item source summaries now report sanitized review and review-comment metadata without exposing bodies, diff hunks, or commit identifiers.
- Opened the `0.2.0-alpha.0` development line.
- GitHub CLI and MCP workflows now route through a single strict source-selection model while preserving the existing overview/open behavior by default.
- Generalized version, bundle, and archive verification around self-describing metadata.
- Provider, Runtime, CLI, and MCP execution boundaries are asynchronous to support real read-only network providers.
- Runtime preserves selected provider provenance for Skill execution without passing raw provider data.
- Risk and next-task output includes optional public provenance, ownership, due-date, and priority metadata.
- GitHub CLI and MCP workflows may resolve repository and limit defaults from provider configuration.
- Live GitHub CLI and MCP workflows read the current time once at the process/tool-call boundary so overdue classification stays correct; local workflows keep a fixed deterministic clock.
- Centralized the GitHub list limit constants (minimum 1, default 50, maximum 100) into one canonical source imported by provider configuration, effective settings, the source-selection resolver, and the CLI parser; the `DEFAULT_GITHUB_PROVIDER_LIMIT` and `GITHUB_CLI_DEFAULT_LIMIT` compatibility aliases are retained. Behavior-preserving; no numeric value, flag, error, or schema changed.

### Hardening and validation

- Cross-platform release-install CI parity: the Windows release-install job (like the POSIX job) verifies that a release installation survives deleting the extracted source bundle and moving the complete installed prefix, re-running the installed CLI and read-only installed-state verification (which exercises the installed MCP) after each operation.
- Controlled, read-only live GitHub smoke through the installed portable artifact: the tokenless provider/CLI flows (status, doctor, repository, issues, search, and a bounded live pull-request discussion) and the installed stdio MCP live workflows (all four GitHub tools, exact ten-tool order) passed with bounded, sanitized projections and no forbidden discussion data (no bodies, diff hunks, or commit identifiers). The authenticated smoke was not run because no token was available.

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

[Unreleased]: https://github.com/he8um/oh-my-pm/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/he8um/oh-my-pm/compare/v0.1.0...v0.2.0
[0.2.0-rc.1]: https://github.com/he8um/oh-my-pm/compare/v0.1.0...v0.2.0-rc.1
