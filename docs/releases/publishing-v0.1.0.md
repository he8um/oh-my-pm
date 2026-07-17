# Publishing OH MY PM v0.1.0

> `v0.1.0` has been published: <https://github.com/he8um/oh-my-pm/releases/tag/v0.1.0>.
> The tag and its assets are immutable. This document is retained as the
> historical record of the gated process used to publish it; the `Release v0.1`
> workflow is release-specific and must not be reused for `v0.2`.

The `v0.1.0` GitHub Release was created only through a manual, multi-gated
workflow. It does not publish to npm or any registry.

## Required one-time setup: the `github-release` environment

The repository owner must configure a GitHub Actions environment named:

```text
github-release
```

Recommended settings:

- add a required reviewer
- prevent self-review when a second reviewer is available
- restrict deployment branches to `main`
- disable administrator bypass where available

No environment secret is required — the publish job uses the workflow-provided
`github.token`.

## The three gates

1. **Manual dispatch** — the workflow only runs via `workflow_dispatch`; there is
   no push/tag/schedule/release trigger.
2. **Exact confirmation** — publishing requires the `confirmation` input to equal
   exactly `RELEASE v0.1.0`; a wrong value fails the workflow rather than
   silently skipping publication.
3. **Protected environment approval** — the publish job runs in the protected
   `github-release` environment and waits for approval.

Additional guarantees:

- the `prepare` job runs with `contents: read` and cannot write repository contents
- only the approved `publish` job receives `contents: write`
- a dry preparation run uses `publish: false` and only uploads a temporary Actions artifact
- no npm publishing occurs at any point

## Operator flow

1. Open the repository **Actions** tab.
2. Select the **Release v0.1** workflow.
3. Choose branch `main`.
4. Leave `version` as `0.1.0`.
5. Run first with `publish: false`.
6. Download and inspect the prepared workflow artifact (`oh-my-pm-v0.1.0-release-assets`).
7. Rerun with:
   - `publish: true`
   - `confirmation: RELEASE v0.1.0`
8. Approve the `github-release` environment deployment when prompted.
9. Verify the published release assets and checksums (the workflow revalidates
   `oh-my-pm-v0.1.0-SHA256SUMS.txt` against the downloaded assets automatically).

## Failure and recovery rules

- Do not use force to overwrite an existing tag or release.
- Investigate a failed preparation run before retrying.
- If a draft or partial release is ever created, inspect it manually before any
  cleanup.
- Never delete a published, immutable release automatically.
- Never auto-retry the publish job from another commit; re-run the full gated
  flow deliberately.
