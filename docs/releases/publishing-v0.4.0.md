# Publishing OH MY PM v0.4.0 (stable)

This describes how the repository owner publishes the stable `v0.4.0` release
through the manually gated `Release v0.4 Stable` workflow
([`.github/workflows/release-v0.4.yml`](../../.github/workflows/release-v0.4.yml)).

> **Nothing is published by preparing the release.** The preparation commit
> (`chore: prepare v0.4.0 release`) only promotes the version, adds release
> documentation and the gated workflow, and updates affected public
> documentation. It creates **no** tag, GitHub Release, or asset, and publishes to
> **no** registry. The latest stable release remains **v0.3.1** until an operator
> explicitly runs this workflow with `publish=true` and approves the protected
> environment. **This document is a runbook; running these steps is a separate,
> explicitly authorized action.**

## What gets published

Exactly three assets, attached to a non-prerelease GitHub Release tagged
`v0.4.0` and marked "latest":

- `oh-my-pm-v0.4.0.tar.gz`
- `oh-my-pm-v0.4.0.zip`
- `oh-my-pm-v0.4.0-SHA256SUMS.txt`

No npm, crates.io, or other registry publication occurs at any point. All
workspace packages remain private.

## Required one-time setup: the `github-release` environment

The repository owner must configure a protected GitHub Actions environment named
`github-release` with required reviewers. The publish job runs in that
environment and waits for a human approval before creating the release. No
environment secret is required — the publish job uses the workflow-provided
`GITHUB_TOKEN` with `contents: write` scoped to that job only.

## Inputs

```text
version       = 0.4.0        (required; the workflow accepts only this exact value)
publish       = false        (default; a dry run leaves it false)
confirmation  = ""           (required only when publish is true)
```

When `publish` is `true`, `confirmation` must equal exactly:

```text
RELEASE v0.4.0
```

## Gates enforced by the workflow

The workflow refuses to proceed unless every one of these holds:

- it was dispatched manually (`workflow_dispatch` only — there is no push,
  pull_request, release, schedule, or tag trigger);
- it runs from `refs/heads/main`;
- `version` equals exactly `0.4.0`;
- publishing carries the exact confirmation string above;
- `version.json` equals the input version;
- the base stable tag `v0.3.1` still exists on origin and resolves exactly to
  `81d869ed4cf690de0da46ab25d1abe65f85df155`;
- the `v0.3.1` release remains non-draft and non-prerelease;
- `docs/releases/v0.4.0.md` exists;
- the tag and release `v0.4.0` do not already exist;
- the built bundle declares release line `v0.4`, profile
  `project-brain-timeline`, twelve MCP tools ending in `project_changes` then
  `project_timeline`, seven memory subcommands, schema `1`, store format `2`,
  `storeMigrationRequired: false`, `mcpWriteTools: 0`,
  `timelinePersistence: false`, `automaticMigration: false`,
  `projectWrites: false`, `transport: stdio`, and the bundled
  `@oh-my-pm/project-memory` package;
- the archives are deterministic and reproducible, and their checksums verify;
- the installed qualification passes on Ubuntu, macOS **and** Windows against the
  one shared prepared asset set, with the expected profile pinned;
- the publish job depends on that qualification matrix, targets the exact
  workflow commit SHA, receives `contents: write` in that job alone, and runs only
  after a human approves the protected `github-release` environment.

## Step 1 — dry run (no tag, no release)

Dispatch with publishing disabled. `publish=false` **is** the dry run: prepare,
deterministic assets, and the cross-platform installed qualification all run, and
the publish job is skipped.

```bash
gh workflow run release-v0.4.yml \
  --repo he8um/oh-my-pm \
  --ref main \
  -f version=0.4.0 \
  -f publish=false
```

Required result:

- `prepare` succeeds;
- deterministic assets are produced and verified;
- installed qualification succeeds on Ubuntu, macOS and Windows;
- the `publish` job is **skipped**;
- **no** tag and **no** release are created;
- `releases/latest` still resolves to `v0.3.1`.

Do not proceed if the dry run fails.

## Step 2 — publish

Only after the dry run succeeds, dispatch from merged `main`:

```bash
gh workflow run release-v0.4.yml \
  --repo he8um/oh-my-pm \
  --ref main \
  -f version=0.4.0 \
  -f publish=true \
  -f confirmation='RELEASE v0.4.0'
```

Wait for `prepare` and all three installed-qualification jobs. The `publish` job
then stops at the protected `github-release` environment and waits for a human
approval:

```text
Review deployments → github-release → Approve and deploy
```

Approve as the repository owner. Do not self-approve with an automation identity.
Do not dispatch a second run; continue monitoring the same run.

## Step 3 — post-publication verification

After the run succeeds, verify independently from the public release:

- the tag `v0.4.0` exists and resolves to the exact merged `main` SHA;
- the release exists, `draft=false`, `prerelease=false`, `latest=true`, and the
  title is `OH MY PM v0.4.0`;
- exactly the three expected assets are attached;
- the downloaded checksums verify independently;
- each archive has one top-level directory and no unexpected public or provenance
  files;
- the installed artifact from **both** archives reports version `0.4.0`, seven
  memory subcommands including `memory timeline`, twelve MCP tools in fixed order
  including `project_timeline`, zero MCP write tools, working timeline filtering
  and pagination, and direct v0.3.1 schema-1/store-2 compatibility with no
  migration;
- no project file is written and no registry publication occurred;
- the historical `v0.1.0`, `v0.2.0-rc.1`, `v0.2.0`, `v0.3.0-rc.1`, `v0.3.0` and
  `v0.3.1` releases are unmodified.

## Never do these

- Never create or move the `v0.4.0` tag manually — the workflow creates it.
- Never modify a historical release or move a historical tag.
- Never publish partial assets.
- Never weaken, skip, or bypass a gate to make a run pass.
- Never publish from a feature branch.
