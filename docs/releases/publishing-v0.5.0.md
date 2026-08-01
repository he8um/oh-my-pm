# Publishing OH MY PM v0.5.0 (stable)

This describes how the repository owner publishes the stable `v0.5.0` release
through the manually gated `Release v0.5 Stable` workflow
([`.github/workflows/release-v0.5.yml`](../../.github/workflows/release-v0.5.yml)).

> **Nothing is published by preparing the release.** The preparation work only
> promotes the version, migrates the command surface, adds release documentation,
> and adds the gated workflow. It creates **no** tag, GitHub Release, or asset, and
> publishes to **no** registry. The latest stable release remains **v0.4.0** until
> an operator explicitly runs this workflow with `publish=true` and approves the
> protected environment. **This document is a runbook; running these steps is a
> separate, explicitly authorized action.**

## What this release changes

v0.5 is a CLI command namespace migration. `ohmypm`, `ohmypm-mcp`, and
`ohmypm-install` become canonical; the former `oh-my-pm` family is retained as
deprecated compatibility aliases with no removal scheduled.

The runtime surface is identical to v0.4 and **no data migration is required**.
Product identity is unchanged — notably the release archives are still named after
the product, not the command.

## What gets published

Exactly three assets, attached to a non-prerelease GitHub Release tagged
`v0.5.0` and marked "latest":

- `oh-my-pm-v0.5.0.tar.gz`
- `oh-my-pm-v0.5.0.zip`
- `oh-my-pm-v0.5.0-SHA256SUMS.txt`

The archive names remain product-based. They are **not** renamed to
`ohmypm-v0.5.0`; only the commands inside migrated.

No npm, crates.io, or other registry publication occurs at any point. All
workspace packages remain private.

## Required one-time setup: the `github-release` environment

The repository owner must configure a protected GitHub Actions environment named
`github-release` with required reviewers. The publish job runs in that environment
and waits for a human approval before creating the release. No environment secret
is required — the publish job uses the workflow-provided `GITHUB_TOKEN` with
`contents: write` scoped to that job only.

## Inputs

```text
version       = 0.5.0        (required; the workflow accepts only this exact value)
publish       = false        (default; a dry run leaves it false)
confirmation  = ""           (required only when publish is true)
```

When `publish` is `true`, `confirmation` must equal exactly:

```text
RELEASE v0.5.0
```

## Gates enforced by the workflow

The workflow refuses to proceed unless every one of these holds:

- it was dispatched manually (`workflow_dispatch` only — there is no push,
  pull_request, release, schedule, or tag trigger, and no `pull_request_target`);
- it runs from `refs/heads/main`;
- `version` equals exactly `0.5.0`;
- publishing carries the exact confirmation string above;
- `version.json` equals the input version;
- the base stable tag `v0.4.0` still exists on origin and resolves exactly to
  `0540a78576222227f276c627c518095ef43f2b50`;
- the `v0.4.0` release remains non-draft and non-prerelease;
- `docs/releases/v0.5.0.md` exists;
- the tag and release `v0.5.0` do not already exist;
- `pnpm validate` passes, which includes the command-surface consistency check and
  the reference-regression check;
- `pnpm validate:commands`, `pnpm validate:references`, and `pnpm version:check`
  each pass explicitly;
- the built bundle declares release line `v0.5`, profile `ohmypm-cli-namespace`,
  twelve MCP tools ending in `project_changes` then `project_timeline`, seven
  memory subcommands, schema `1`, store format `2`,
  `storeMigrationRequired: false`, `mcpWriteTools: 0`,
  `timelinePersistence: false`, `automaticMigration: false`,
  `projectWrites: false`, `transport: stdio`, and the bundled
  `@oh-my-pm/project-memory` package;
- the bundle declares `canonicalCommands` (`ohmypm`, `ohmypm-mcp`,
  `ohmypm-install`) and `legacyAliases` as distinct fields, with
  `commandRemovalScheduled: false` and installer entrypoint
  `bin/ohmypm-install.mjs`;
- the bundle ships all six command entrypoints — the three canonical ones and the
  three compatibility aliases;
- the bundle name is still product-based (`oh-my-pm-v0.5.0`);
- the archives are deterministic and reproducible, and their checksums verify;
- the installed qualification passes on Ubuntu, macOS **and** Windows against the
  one shared prepared asset set, with the expected profile pinned;
- the canonical/alias installed smoke passes: all eight shims exist, the canonical
  command writes nothing to stderr, each alias produces byte-identical stdout,
  warns on stderr, keeps the warning off stdout, and leaves piped JSON parseable;
- the installed manifest separates `commands` (canonical) from `legacyCommands`;
- the publish job depends on that qualification matrix, targets the exact workflow
  commit SHA, receives `contents: write` in that job alone, and runs only after a
  human approves the protected `github-release` environment.

## Step 1 — dry run (no tag, no release)

Dispatch with publishing disabled. `publish=false` **is** the dry run: prepare,
deterministic assets, and the cross-platform installed qualification all run, and
the publish job is skipped.

```bash
gh workflow run release-v0.5.yml \
  --repo he8um/oh-my-pm \
  --ref main \
  -f version=0.5.0 \
  -f publish=false
```

Required result:

- `prepare` succeeds;
- deterministic assets are produced and verified;
- installed qualification succeeds on Ubuntu, macOS and Windows;
- the canonical and compatibility-alias smoke steps both succeed;
- the `publish` job is **skipped**;
- **no** tag and **no** release are created;
- `releases/latest` still resolves to `v0.4.0`.

Do not proceed if the dry run fails.

## Step 2 — publish

Only after the dry run succeeds, dispatch from merged `main`:

```bash
gh workflow run release-v0.5.yml \
  --repo he8um/oh-my-pm \
  --ref main \
  -f version=0.5.0 \
  -f publish=true \
  -f confirmation='RELEASE v0.5.0'
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

- the tag `v0.5.0` exists and resolves to the exact merged `main` SHA;
- the release exists, `draft=false`, `prerelease=false`, `latest=true`, and the
  title is `OH MY PM v0.5.0`;
- exactly the three expected assets are attached, with product-based names;
- the downloaded checksums verify independently;
- each archive has one top-level `oh-my-pm-v0.5.0/` directory and no unexpected
  public or provenance files;
- the installed artifact from **both** archives:
  - reports version `0.5.0` through `ohmypm status`;
  - installs all eight shims, canonical and alias, POSIX and `.cmd`;
  - runs `ohmypm`, `ohmypm-mcp` and `ohmypm-install`;
  - runs `oh-my-pm`, `oh-my-pm-mcp` and `oh-my-pm-install` as deprecated aliases,
    each warning on stderr only;
  - keeps `oh-my-pm status --json` stdout parseable;
  - keeps `oh-my-pm-mcp` stdout protocol-safe through a full MCP handshake;
  - generates MCP configuration invoking `ohmypm-mcp` with the server key still
    `oh-my-pm`;
  - still reports seven memory subcommands and twelve MCP tools in fixed order;
  - reads a v0.4 store with **no** migration;
- an existing v0.4-style prefix upgrades with `--force`, leaving all six commands
  working and no orphaned shim;
- no project file is written and no registry publication occurred;
- the historical `v0.1.0`, `v0.2.0-rc.1`, `v0.2.0`, `v0.3.0-rc.1`, `v0.3.0`,
  `v0.3.1` and `v0.4.0` releases are unmodified.

## Never do these

- Never create or move the `v0.5.0` tag manually — the workflow creates it.
- Never modify a historical release or move a historical tag.
- Never rename the release archives to a command-based name.
- Never remove the compatibility aliases as part of this release; no removal is
  scheduled.
- Never publish partial assets.
- Never weaken, skip, or bypass a gate to make a run pass.
- Never publish from a feature branch.
