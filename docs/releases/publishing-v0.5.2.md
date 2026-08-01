# Publishing OH MY PM v0.5.2 (stable)

This describes how the repository owner publishes the stable `v0.5.2` release
through the manually gated `Release v0.5 Stable` workflow
([`.github/workflows/release-v0.5.yml`](../../.github/workflows/release-v0.5.yml)).

> **Nothing is published by preparing the release.** The preparation work only
> centralizes the GitHub workflow composition, promotes the version, and
> retargets the gated workflow. It creates **no** tag, GitHub Release, or asset,
> and publishes to **no** registry. The latest stable release remains **v0.5.1**
> until an operator explicitly runs this workflow with `publish=true` and
> approves the protected environment. **This document is a runbook; running these
> steps is a separate, explicitly authorized action.**

## Release lineage

- The immutable base stable release is **`v0.5.1`** at `49e2cbb`. The workflow
  verifies it still exists on origin, still resolves to that exact SHA, and is
  still non-draft and non-prerelease. It refuses to publish otherwise.
- There is **no `v0.5.0` tag and no `v0.5.0` GitHub release**: that work merged
  to `main` but was never published.
- **`v0.5.2` is the second published stable of the v0.5 line**, a maintenance
  patch over `v0.5.1`.
- No existing release tag is moved, replaced, recreated, or deleted.

## What this release changes

An internal architecture refactor only. The GitHub-backed project workflow is
composed once in `@oh-my-pm/application`, so the CLI and MCP surfaces consume
the same application use case instead of each rebuilding the Runtime pipeline.

The user-facing runtime surface is **identical** to v0.5.1: the same canonical
commands, the same twelve read-only MCP tools in the same registration order
with the same schemas and annotations, the same seven memory subcommands,
Project Brain schema `1`, and Project Memory store format `2`.

**No data migration is required.** Product identity is unchanged, and the
release archives are still named after the product, not the command.

Because the runtime surface is unchanged, the release line stays **`v0.5`** and
the bundle profile stays **`ohmypm-cli-namespace`**. A new bundle profile is not
created for an internal architecture refactor.

## What gets published

Exactly three assets, attached to a non-prerelease GitHub Release tagged
`v0.5.2` and marked "latest":

- `oh-my-pm-v0.5.2.tar.gz`
- `oh-my-pm-v0.5.2.zip`
- `oh-my-pm-v0.5.2-SHA256SUMS.txt`

Nothing is published to npm or any other registry. The workspace packages stay
private.

## Preconditions

Before dispatching the workflow, confirm all of the following:

1. The v0.5.2 pull request is **merged into `main`**, and you are publishing
   from `main`. The workflow refuses any other ref.
2. `version.json` reports `0.5.2`. The workflow refuses if the input version and
   `version.json` disagree.
3. CI is green on the merge commit, including the cross-platform installed
   qualification on Ubuntu, macOS, and Windows.
4. `docs/releases/v0.5.2.md` exists. The workflow checks for it.
5. `v0.5.1` still exists on origin at `49e2cbb` and is still marked non-draft
   and non-prerelease.
6. No `v0.5.2` tag or release already exists. The workflow refuses to overwrite
   either.
7. The remaining v0.5.2 scope tracked in Issues #30, #32, and #33 is complete,
   or has been explicitly deferred by the owner. **v0.5.2 publication is
   intentionally deferred until then.**

## Step 1 — dry run

Run the workflow with `publish=false`. This is the full rehearsal: it prepares
the bundle, builds the deterministic archives, verifies reproducibility, and
runs the cross-platform installed qualification — but the publish job is
skipped, so **no tag and no release are created** and `releases/latest` is
untouched.

| Input | Value |
| --- | --- |
| `version` | `0.5.2` |
| `publish` | `false` |
| `confirmation` | *(leave empty)* |

Confirm the run is green and that the produced archive names are
`oh-my-pm-v0.5.2.*` before continuing.

## Step 2 — publish

Only after a green dry run, and only when publication is explicitly authorized:

| Input | Value |
| --- | --- |
| `version` | `0.5.2` |
| `publish` | `true` |
| `confirmation` | `RELEASE v0.5.2` |

The confirmation string must match **exactly**. It is enforced twice — once in
the prepare job and again in the publish job — so a mistyped value cannot reach
the tag-creation step.

The publish job additionally requires approval of the protected
`github-release` environment. That approval is the last human gate.

## Step 3 — verify after publication

```bash
gh release view v0.5.2 --repo he8um/oh-my-pm
gh api repos/he8um/oh-my-pm/releases/latest --jq .tag_name
gh release list --repo he8um/oh-my-pm
```

Confirm:

- `v0.5.2` is non-draft, non-prerelease, and the latest-release endpoint
  resolves to `v0.5.2`.
- All three assets are attached, and the checksum file verifies:
  `sha256sum -c oh-my-pm-v0.5.2-SHA256SUMS.txt`.
- `v0.5.1`, `v0.4.0`, `v0.3.1`, `v0.3.0`, `v0.3.0-rc.1`, `v0.2.0`,
  `v0.2.0-rc.1`, and `v0.1.0` are all unchanged.
- Installing the published archive into a scratch prefix produces a working
  `ohmypm status`, and the deprecated `oh-my-pm` alias still warns on stderr
  only.

## If something goes wrong

Do **not** delete or move a published tag. If a released artifact is wrong,
prepare a `v0.5.3` patch over it. An immutable release stays immutable.

## Not part of publication

- No npm publication.
- No Dashboard, HTTP server, or UI artifact.
- No storage migration, and no change to an existing Project Brain store.
- No change to the compatibility aliases, which remain supported with no removal
  scheduled.
- No GitHub mutation capability; the provider stays GET-only against a fixed
  origin.
