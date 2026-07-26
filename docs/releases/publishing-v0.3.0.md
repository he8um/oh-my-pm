# Publishing OH MY PM v0.3.0 (stable)

This describes how the repository owner publishes the stable `v0.3.0` release
through the manually gated `Release v0.3 Stable` workflow
([`.github/workflows/release-v0.3.yml`](../../.github/workflows/release-v0.3.yml)).

> **Nothing is published by preparing the stable release.** The preparation
> commit (`chore: prepare v0.3.0 stable`) only promotes the version, adds stable
> documentation and the gated workflow, and corrects public documentation. It
> creates **no** tag, GitHub Release, or asset, and publishes to **no** registry.
> The latest stable release remains **v0.2.0** until an operator explicitly runs
> this workflow with `publish=true` and approves the protected environment.
> **This document is a runbook; running these steps is a separate, explicitly
> authorized action.**

## What gets published

Exactly three assets, attached to a non-prerelease GitHub Release tagged
`v0.3.0` and marked "latest":

- `oh-my-pm-v0.3.0.tar.gz`
- `oh-my-pm-v0.3.0.zip`
- `oh-my-pm-v0.3.0-SHA256SUMS.txt`

No npm, crates.io, or other registry publication occurs at any point. All
workspace packages remain private.

## Required one-time setup: the `github-release` environment

The repository owner must configure a protected GitHub Actions environment named
`github-release` with required reviewers. The publish job runs in that
environment and waits for a human approval before creating the release. No
environment secret is required — the publish job uses the workflow-provided
`GITHUB_TOKEN` with `contents: write` scoped to that job only.

## Inputs

```
version       = 0.3.0        (required; the workflow accepts only this exact value)
publish       = false        (default; a preparation/dry run leaves it false)
confirmation  = ""           (default empty)
```

To publish, `publish=true` and `confirmation` must equal exactly:

```
RELEASE v0.3.0
```

## The gates

1. **Manual dispatch only** — `workflow_dispatch`; no push, PR, tag, release, or
   schedule trigger.
2. **Branch** — dispatched from `main` (`refs/heads/main`).
3. **Exact version** — `version` must equal `0.3.0`, and `version.json` on the
   dispatched commit must equal `0.3.0`.
4. **Publish opt-in** — `publish` defaults to `false`; a dry run prepares and
   qualifies the artifact and uploads only a temporary Actions artifact.
5. **Exact confirmation** — `publish=true` requires `confirmation` equal to
   `RELEASE v0.3.0`.
6. **Validated RC lineage + GO** — the `v0.3.0-rc.1` tag must still target
   `1db4057b7dfb31cae7f0d6db593928ee1287ef85`, the RC release must remain a
   non-draft prerelease, and the post-publication report must contain
   `GO FOR v0.3.0 STABLE PREPARATION`.
7. **Cross-platform qualification** — the publish job depends on the
   `installed-qualification` matrix (Ubuntu, macOS, Windows), which extracts,
   installs, and runs the installed Project Brain CLI + MCP journeys against the
   exact prepared artifact before any publish can proceed.
8. **Protected environment approval** — the publish job runs in the protected
   `github-release` environment and waits for reviewer approval.
9. **Least privilege** — top-level, prepare-job, and qualification-job
   permissions are `contents: read`; only the publish job is granted
   `contents: write` (exactly once).
10. **Stable, marked latest** — the release is created with `--latest` and never
    with `--prerelease`; the published release is verified `isPrerelease === false`
    and `releases/latest` is verified to resolve to `v0.3.0`.
11. **Exact commit target** — the tag/release targets the exact workflow commit
    SHA (`--target "$GITHUB_SHA"`), never floating `main`.
12. **No overwrite** — the publish job refuses to proceed if the `v0.3.0` tag or
    release already exists.
13. **Immutable history** — the historical `v0.1.0`, `v0.2.0-rc.1`, `v0.2.0`, and
    `v0.3.0-rc.1` releases and their assets are never modified.

## Owner-operated publication steps

> Perform these only when publication of `v0.3.0` has been explicitly authorized.
> Do not run them as part of preparation.

1. Confirm `main` is at the prepared commit `chore: prepare v0.3.0 stable` and CI
   is green (Ubuntu validate, Windows release-install smoke, and the v0.3
   installed-qualification matrix on Linux/macOS/Windows).
2. In the GitHub Actions UI, run **Release v0.3 Stable** (`workflow_dispatch`)
   from `main` with:
   - `version` = `0.3.0`
   - `publish` = `false`
   - `confirmation` = (leave empty)

   This is a dry run: it builds and verifies the project-brain bundle, builds and
   verifies the deterministic archives, and runs the cross-platform installed
   qualification. It publishes nothing.
3. Review the run summary — confirm the archive checksums and that every
   qualification job passed.
4. Re-run **Release v0.3 Stable** from `main` with:
   - `version` = `0.3.0`
   - `publish` = `true`
   - `confirmation` = `RELEASE v0.3.0`
5. Approve the protected `github-release` environment when prompted.
6. The publish job creates the `v0.3.0` stable release at the exact commit SHA,
   attaches exactly the three assets, marks it latest, verifies
   `isPrerelease === false`, verifies `releases/latest` resolves to `v0.3.0`, and
   re-downloads and re-checksums the published assets.

## What the workflow will NOT do

- It will not publish to npm, crates.io, or any registry.
- It will not push a Docker image.
- It will not modify the immutable `v0.1.0`, `v0.2.0-rc.1`, `v0.2.0`, or
  `v0.3.0-rc.1` releases.
- It will not proceed without the exact confirmation string, the protected
  environment approval, and green cross-platform qualification.
