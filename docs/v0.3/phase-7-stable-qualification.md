# v0.3 Phase 7 — Stable Qualification and v0.3.0 Preparation

Phase 7 validates the published `v0.3.0-rc.1` prerelease from its public GitHub
Release assets and, on a GO decision, prepares the stable `v0.3.0` source. It
adds **no product behavior**: it promotes the version, adds stable documentation
and a protected stable release workflow, and corrects public documentation. It
does **not** create the `v0.3.0` tag, does not create a stable GitHub Release, and
does not run the stable workflow with `publish=true`. Publication of `v0.3.0` is a
separate, explicitly authorized action.

## Post-RC validation (Stage A)

The published `v0.3.0-rc.1` prerelease was validated directly from its public
assets — not a local rebuild. See
[../releases/v0.3.0-rc.1-post-publication-validation.md](../releases/v0.3.0-rc.1-post-publication-validation.md)
for the full report. Summary of evidence:

- RC tag `v0.3.0-rc.1` resolves on origin to
  `1db4057b7dfb31cae7f0d6db593928ee1287ef85`; the release is a non-draft
  prerelease with exactly the three expected assets; `releases/latest` remains
  `v0.2.0`.
- Native checksum verification of both public archives: OK. Repository archive
  check: OK. Bundle verifier on both tar and zip extractions: OK. tar/zip logical
  inventory parity: identical (3889 files). Archive reproducibility: OK.
- The public `RELEASE.json` declares the exact project-brain profile (eleven
  tools, schema 1, store format 2, six memory subcommands, one read tool, zero
  write tools) and bundles `@oh-my-pm/project-memory` dist-only; all packages
  remain private.
- The installed-artifact qualification passed **162/162** against both the public
  `.tar.gz` and the public `.zip`, covering the installer, the full CLI journey
  (all output modes), the eleven-tool MCP surface and the `project_changes`
  lifecycle, migration, corruption/recovery, concurrency, privacy, source
  independence, and relocation.
- CI on the current `main` (`ba37d42`) — `CI` (Ubuntu validate + Windows
  release-install smoke) and `v0.3 Installed Qualification` (Ubuntu/macOS/Windows
  installed qualification of one shared prepared artifact) — passed.
- The only findings were Low-severity documentation-truthfulness corrections and
  one Informational deferral; no Blocker/High/Medium, no data loss, migration
  corruption, privacy/token leak, project write, uncontrolled write, core
  nondeterminism, broken platform, or MCP write exposure.

Decision: `GO FOR v0.3.0 STABLE PREPARATION`.

## Version promotion (Stage B)

The canonical source version was promoted `0.3.0-rc.1 → 0.3.0` across every
version surface: `version.json`, all workspace package manifests, the Rust crate
manifest and lockfile, the Rust `kernel_version`/`kernel_scaffold_version`
literals and their test assertions, the CLI/MCP runtime version constants, and
the version-assertion tests. `check-version-consistency` reports `OK (0.3.0)`.
The promotion changes no product semantics. RC references inside the RC notes, RC
guide, RC validation report, the RC release workflow, and immutable tag records
are preserved.

## Stable documentation

- [../releases/v0.3.0.md](../releases/v0.3.0.md) — stable release notes.
- [../releases/publishing-v0.3.0.md](../releases/publishing-v0.3.0.md) — the
  owner-operated stable publishing runbook.
- [getting-started-installed.md](getting-started-installed.md) — the stable
  installed getting-started guide (the RC guide is preserved as historical).
- This report.

## Stable release workflow

`.github/workflows/release-v0.3.yml` (`Release v0.3 Stable`) is
`workflow_dispatch`-only with no push/PR/tag/release/schedule trigger. It gates on
`version == "0.3.0"`, `publish == true` with `confirmation == "RELEASE v0.3.0"`,
the validated RC lineage (`v0.3.0-rc.1` targeting `1db4057…`) and the recorded GO
decision, and a cross-platform installed-qualification matrix
(Ubuntu/macOS/Windows). Top-level, prepare, and qualification permissions are
`contents: read`; only the publish job holds `contents: write` (exactly once) and
runs in the protected `github-release` environment. It creates a non-prerelease
`--latest` release named "OH MY PM v0.3.0" targeting the exact workflow commit
SHA, attaches exactly the three stable assets, refuses to overwrite an existing
tag/release, verifies the published release and `releases/latest`, and performs no
registry publish. It uses `actions/upload-artifact@v7` and
`actions/download-artifact@v5`. It is prepared but not dispatched with
`publish=true`.

## Non-publishing dry run

The stable workflow's prepare + Ubuntu/macOS/Windows qualification path is
exercised with `publish=false` (empty confirmation); the publish job is skipped.
After the dry run: no `v0.3.0` tag, no `v0.3.0` release, `releases/latest` remains
`v0.2.0`, `v0.3.0-rc.1` unchanged, and no registry artifact.

## Decision

`v0.3.0 STABLE PREPARATION COMPLETE — READY FOR SEPARATE EXPLICIT PUBLICATION.`
Publication of `v0.3.0` requires a separate, explicit owner authorization.
