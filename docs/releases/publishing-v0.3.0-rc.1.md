# Publishing OH MY PM v0.3.0-rc.1

This describes how the repository owner publishes the first `v0.3` release
candidate through the manually gated `Release v0.3 RC` workflow
([`.github/workflows/release-v0.3-rc.yml`](../../.github/workflows/release-v0.3-rc.yml)).

> **Nothing is published by preparing the candidate.** The preparation commit
> (`chore: prepare 0.3.0-rc.1`) only promotes the version, packages the
> self-contained "project-brain" bundle, and adds documentation, qualification,
> and the gated workflow. It creates **no** tag, GitHub Release, or asset, and
> publishes to **no** registry. The latest stable release remains **v0.2.0**
> until an operator explicitly runs this workflow with `publish=true` and
> approves the protected environment. **This document is a runbook; running these
> steps is a separate, explicitly authorized action.**

## What gets published

Exactly three assets, attached to a GitHub **prerelease** tagged `v0.3.0-rc.1`
(never marked "latest"):

- `oh-my-pm-v0.3.0-rc.1.tar.gz`
- `oh-my-pm-v0.3.0-rc.1.zip`
- `oh-my-pm-v0.3.0-rc.1-SHA256SUMS.txt`

No npm, crates.io, or other registry publication occurs at any point. All
workspace packages remain private.

## Required one-time setup: the `github-release` environment

The repository owner must configure a protected GitHub Actions environment named
`github-release` with required reviewers. The publish job runs in that
environment and waits for a human approval before creating the release. No
environment secret is required — the publish job uses the workflow-provided
`GITHUB_TOKEN` with `contents: write` scoped to that job only.

## The gates

1. **Manual dispatch only** — the workflow runs solely via `workflow_dispatch`;
   there are no `push`, `pull_request`, `schedule`, `release`, or tag triggers.
2. **Branch** — it must be dispatched from `main` (`refs/heads/main`).
3. **Exact version** — the `version` input must equal `0.3.0-rc.1`, and
   `version.json` on the dispatched commit must equal the input.
4. **Publish opt-in** — `publish` is a boolean, default `false`. A preparation
   (dry) run leaves it `false`, prepares and qualifies the artifact, and uploads
   only a temporary Actions artifact.
5. **Exact confirmation** — `publish=true` requires the `confirmation` input to
   equal exactly `RELEASE v0.3.0-rc.1`.
6. **Cross-platform qualification** — the publish job depends on the
   `installed-qualification` matrix (Ubuntu, macOS, Windows), which extracts,
   installs, and runs the installed Project Brain CLI + MCP journeys against the
   exact prepared artifact before any publish can proceed.
7. **Protected environment approval** — the publish job runs in the protected
   `github-release` environment and waits for reviewer approval.
8. **Least privilege** — top-level, prepare-job, and qualification-job
   permissions are `contents: read`; only the publish job is granted
   `contents: write`.
9. **Prerelease, never latest** — the release is created with `--prerelease` and
   never with `--latest`.
10. **Exact commit target** — the tag/release targets the exact workflow commit
    SHA (`--target "$GITHUB_SHA"`), never floating `main`.
11. **No overwrite** — the publish job refuses to proceed if the `v0.3.0-rc.1`
    tag or release already exists.
12. **Stable baseline unchanged** — the publish job verifies the published
    stable `v0.2.0` release remains non-prerelease and non-draft. The historical
    `v0.1.0`, `v0.2.0-rc.1`, and `v0.2.0` releases and their assets are never
    modified.

## Owner-operated publication steps

> Perform these only when publication of `v0.3.0-rc.1` has been explicitly
> authorized. Do not run them as part of preparation.

1. Confirm `main` is at the prepared commit `chore: prepare 0.3.0-rc.1` and CI is
   green (Ubuntu validate, Windows release-install smoke, and the v0.3
   installed-qualification matrix on Linux/macOS/Windows).
2. In the GitHub Actions UI, run **Release v0.3 RC** (`workflow_dispatch`) from
   `main` with:
   - `version` = `0.3.0-rc.1`
   - `publish` = `false`
   - `confirmation` = (leave empty)

   This is a dry run: it builds and verifies the bundle, builds and verifies the
   deterministic archives, and runs the cross-platform installed qualification.
   It publishes nothing.
3. Review the run summary — confirm the archive checksums and that every
   qualification job passed.
4. Re-run **Release v0.3 RC** from `main` with:
   - `version` = `0.3.0-rc.1`
   - `publish` = `true`
   - `confirmation` = `RELEASE v0.3.0-rc.1`
5. Approve the protected `github-release` environment when prompted.
6. The publish job creates the `v0.3.0-rc.1` prerelease at the exact commit SHA,
   attaches exactly the three assets, verifies `isPrerelease === true`, and
   re-downloads and re-checksums the published assets.

## What the workflow will NOT do

- It will not mark the release "latest".
- It will not publish to npm, crates.io, or any registry.
- It will not push a Docker image.
- It will not modify the immutable `v0.1.0`, `v0.2.0-rc.1`, or `v0.2.0` releases.
- It will not proceed without the exact confirmation string, the protected
  environment approval, and green cross-platform qualification.

## After publication

Post-RC validation (installing the published prerelease on each platform,
gathering feedback, and deciding on stable v0.3 preparation) is a **separate,
later** activity. Publishing this RC does not authorize stable v0.3 preparation.
