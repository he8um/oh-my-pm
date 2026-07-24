# Publishing OH MY PM v0.2.0-rc.1

This describes how to publish the first `v0.2` release candidate through the
manually gated `Release v0.2 RC` workflow
([`.github/workflows/release-v0.2-rc.yml`](../../.github/workflows/release-v0.2-rc.yml)).

> **Nothing is published by preparing the candidate.** The preparation commit
> (`chore: prepare 0.2.0-rc.1`) only promotes the version, freezes scope, and adds
> documentation and the gated workflow. It creates **no** tag, GitHub Release, or
> asset, and publishes to **no** registry. The latest stable release remains
> `v0.1.0` until an operator explicitly runs the workflow with `publish=true` and
> approves the protected environment.

## What gets published

Exactly three assets, attached to a GitHub **prerelease** tagged `v0.2.0-rc.1`
(never marked "latest"):

- `oh-my-pm-v0.2.0-rc.1.tar.gz`
- `oh-my-pm-v0.2.0-rc.1.zip`
- `oh-my-pm-v0.2.0-rc.1-SHA256SUMS.txt`

No npm, crates.io, or other registry publication occurs at any point.

## Required one-time setup: the `github-release` environment

The repository owner must configure a protected GitHub Actions environment named
`github-release` with required reviewers. The publish job runs in that
environment and waits for a human approval before creating the release. No
environment secret is required — the publish job uses the workflow-provided
`GITHUB_TOKEN` with `contents: write` scoped to that job only.

## The gates

1. **Manual dispatch only** — the workflow runs solely via `workflow_dispatch`;
   there are no automatic triggers.
2. **Branch** — it must be dispatched from `main` (`refs/heads/main`).
3. **Exact version** — the `version` input must equal `0.2.0-rc.1`, and
   `version.json` on the dispatched commit must equal the input.
4. **Publish opt-in** — `publish` is a boolean, default `false`. A preparation
   (dry) run leaves it `false` and uploads only a temporary Actions artifact.
5. **Exact confirmation** — `publish=true` requires the `confirmation` input to
   equal exactly `RELEASE v0.2.0-rc.1`.
6. **Protected environment approval** — the publish job runs in the protected
   `github-release` environment and waits for reviewer approval.
7. **Least privilege** — top-level and prepare-job permissions are `contents:
   read`; only the publish job is granted `contents: write`.
8. **Prerelease, never latest** — the release is created with `--prerelease` and
   never with `--latest`.
9. **No overwrite** — the publish job refuses to proceed if the `v0.2.0-rc.1`
   tag or a release for it already exists; there is no force overwrite.

## Operator flow

1. Confirm the preparation commit is on `main` and normal CI (Ubuntu validate and
   Windows release install smoke) is green.
2. Inspect the promoted version (`version.json` = `0.2.0-rc.1`) and the release
   notes ([`v0.2.0-rc.1.md`](v0.2.0-rc.1.md)).
3. Run `Release v0.2 RC` with `publish=false` (dry run). The prepare job builds
   and verifies the bundle, archives (including reproducibility), and the
   installer (preview/apply, source-removal, prefix-relocation), then uploads the
   temporary `oh-my-pm-v0.2.0-rc.1-release-assets` artifact.
4. Download and inspect that temporary Actions artifact.
5. Independently verify the checksums and archive contents locally.
6. Re-run the workflow with `publish=true` and `confirmation: RELEASE v0.2.0-rc.1`.
7. Approve the `github-release` environment deployment when prompted.
8. Verify the published tag, prerelease metadata (`isPrerelease=true`,
   `isDraft=false`, not latest), the exact three assets, the checksums, and a
   fresh install of the published archive (CLI `status` reports `0.2.0-rc.1`; the
   MCP server lists exactly ten tools).

## Failure and recovery rules

- The prepare job never creates a tag or release; a failed prepare run is safe to
  re-dispatch after fixing the cause.
- If the tag or release already exists, the publish job refuses — do not force.
- Never delete a published, immutable prerelease automatically.
- Never auto-retry the publish job from a different commit; re-run the full gated
  flow from a known-good `main` commit.

## This commit does not publish

Preparing `0.2.0-rc.1` is documentation, version promotion, and workflow
addition only. Publication is a separate, explicitly approved action performed by
an operator through the gated workflow above.
