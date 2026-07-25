# Publishing OH MY PM v0.2.0 (stable)

This describes how to publish the **stable** `v0.2.0` release through the
manually gated `Release v0.2 Stable` workflow
([`.github/workflows/release-v0.2.yml`](../../.github/workflows/release-v0.2.yml)).

> **Nothing stable is published by preparing it.** The preparation commit
> (`chore: prepare v0.2.0 stable`) only promotes the version from `0.2.0-rc.1` to
> `0.2.0`, finalizes documentation, and adds the gated stable workflow and its
> static validator. It creates **no** stable tag, GitHub Release, or asset, and
> publishes to **no** registry. The currently published release remains the
> `v0.2.0-rc.1` **prerelease**, and the latest **stable** release remains
> `v0.1.0` until an operator explicitly runs the workflow with `publish=true`,
> types the exact confirmation, and approves the protected environment.

## Purpose

Turn the prepared, locally rehearsed `0.2.0` source tree into the immutable
stable GitHub Release `v0.2.0` — a non-draft, non-prerelease release marked
"latest" — carrying exactly three verified assets, targeting the exact workflow
commit, and using [`v0.2.0.md`](v0.2.0.md) as its release notes.

## Authorization boundary

Stable publication requires a **separate, explicit owner approval** that is
distinct from stable preparation. Preparing `0.2.0` (version promotion,
documentation, the gated workflow, the environment reviewer) is authorized on its
own; running the workflow with `publish=true` is not authorized by preparation
and must never be performed as a side effect. This guide does not itself
authorize publication.

## Required baseline

Before dispatching:

- `main` contains the preparation commit `chore: prepare v0.2.0 stable`.
- `version.json` on the dispatched commit equals `0.2.0`.
- Version consistency passes: `node tools/check-version-consistency.mjs` prints
  `OK (0.2.0)`.
- Normal CI is green (Ubuntu validate and the Windows release-install smoke).
- No stable `v0.2.0` tag or release exists yet.

## RC evidence requirement

The stable release consolidates the validated `v0.2.0-rc.1`. The prepare job
verifies, and the operator must confirm, that:

- the `v0.2.0-rc.1` tag exists and its release is a prerelease;
- the RC tag resolves to `fd03cce809812b3d4914a9a0e24594147ac6039c`;
- the post-publication validation report
  ([`v0.2.0-rc.1-post-publication-validation.md`](v0.2.0-rc.1-post-publication-validation.md))
  records the stable **GO** decision.

The RC tag, release, and assets must remain unchanged by stable publication.

## Environment governance requirement

The publish job runs in the protected `github-release` environment, which must
have at least one **required reviewer** so publication pauses for a manual
approval gate. As prepared, this environment has a required reviewer (`he8um`,
type User) alongside its custom `main` branch policy. No environment secret is
required — the publish job uses the workflow-provided `GITHUB_TOKEN` scoped to
`contents: write` for that job only.

## Dry-run procedure

Run `Release v0.2 Stable` with:

```text
version: 0.2.0
publish: false
confirmation: (empty)
ref: main
```

The prepare job enforces `main`, requires `version == 0.2.0`, verifies
`version.json`, verifies the RC evidence above, builds contracts/Kernel/packages,
runs tests/validate/MCP smoke, builds and verifies the stable portable bundle,
builds and verifies the deterministic archives (including reproducibility),
verifies the installer preview/apply/source-removal/prefix-relocation, prints
checksums, and uploads a **temporary** Actions artifact. A dry run creates only
that temporary artifact — no tag, release, or public asset.

## Dry-run artifact inspection

Download the temporary `oh-my-pm-v0.2.0-release-assets` artifact and confirm it
contains exactly:

- `oh-my-pm-v0.2.0.tar.gz`
- `oh-my-pm-v0.2.0.zip`
- `oh-my-pm-v0.2.0-SHA256SUMS.txt`

Independently re-verify the checksums and archive contents locally
(`sha256sum --check`, extract, run `check-release-archives.mjs`) before
proceeding to publication.

## Explicit publication inputs

Publication requires re-running the workflow with the exact inputs:

```text
version: 0.2.0
publish: true
confirmation: RELEASE v0.2.0
ref: main
```

`publish=true` without `confirmation` equal to `RELEASE v0.2.0` is rejected. Any
other version is rejected.

## Protected-environment approval

When the publish job starts, it waits in the `github-release` environment for the
required reviewer to approve the deployment. Approve only after the dry-run
artifact has been inspected and the checksums independently verified.

## Stable tag/release verification

The publish job refuses to proceed if the tag `v0.2.0` or a release for it
already exists (no force overwrite). On success it creates the stable Release
`v0.2.0` targeting the exact workflow commit, using [`v0.2.0.md`](v0.2.0.md) as
the release notes, as a **non-draft, non-prerelease** release marked **latest**.
Verify:

- `tagName == v0.2.0`
- `isDraft == false`
- `isPrerelease == false`

## Latest-release verification

Confirm the repository's latest release resolves to the stable tag:

```bash
gh api repos/he8um/oh-my-pm/releases/latest --jq .tag_name   # v0.2.0
```

## Published artifact verification

Confirm exactly the three assets are attached and their checksums match by
re-downloading them from the published release and running
`sha256sum --check oh-my-pm-v0.2.0-SHA256SUMS.txt`.

## Public installation verification

From a clean environment with only Node.js 20+:

```bash
gh release download v0.2.0 --dir ./dl
cd dl
sha256sum --check oh-my-pm-v0.2.0-SHA256SUMS.txt
tar -xzf oh-my-pm-v0.2.0.tar.gz
node ./oh-my-pm-v0.2.0/bin/oh-my-pm-install.mjs --prefix "$PWD/prefix"          # preview
node ./oh-my-pm-v0.2.0/bin/oh-my-pm-install.mjs --prefix "$PWD/prefix" --apply  # apply
./prefix/bin/oh-my-pm status         # reports version 0.2.0, kernel 0.2.0
./prefix/bin/oh-my-pm-mcp            # stdio MCP; exactly ten tools, fixed order
```

Prove source independence (delete the extracted bundle; installed commands still
work) and prefix relocation (move the whole prefix; installed commands still
work).

## Failure and partial-publication handling

- The prepare job never creates a tag or release; a failed prepare run is safe to
  re-dispatch after fixing the cause.
- If the publish job fails after creating the tag/release, do not force a second
  create over the existing one; investigate and, if the release is incomplete,
  remediate through the gated flow from the same known-good `main` commit.
- Never auto-retry the publish job from a different commit.
- Never modify, delete, or re-point the `v0.2.0-rc.1` prerelease or the `v0.1.0`
  stable release during stable publication.

## Rollback policy

A published, immutable release is not silently overwritten. If a defect is found
after publication, prefer a forward fix (a new patch release) over deleting or
mutating `v0.2.0`. Any removal of a published release is a separate, explicit,
owner-approved action — never automatic.

## Post-publication validation

After publication, validate the public stable release the way a user would
consume it (from the public assets): artifact/checksum verification, installation
UX, source independence, prefix relocation, the four local workflows, the strict
configuration matrix, tokenless live GitHub read-only workflows, and all ten
stdio MCP tools. Record the results in a post-publication validation note, and
confirm the RC and `v0.1.0` releases are unchanged.

## Prohibited actions

- No automatic triggers — the workflow is `workflow_dispatch` only.
- No version other than `0.2.0`; no confirmation string other than
  `RELEASE v0.2.0`.
- No `contents: write` outside the publish job; no publish without the
  `github-release` environment.
- No `--prerelease` on the stable release; it must be marked latest.
- No registry publication (npm, crates.io, or otherwise) at any point.
- No modification of the RC or `v0.1.0` release, tag, or assets.
- No publication without a separate, explicit owner approval.
