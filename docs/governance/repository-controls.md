# Hosted repository controls

Observed and configured state of the controls that live in GitHub rather than in
this repository's files. Recorded because they are invisible in a checkout: a
reader cannot tell from the source whether `main` is protected or whether the
release environment requires approval.

**Verified:** 2026-08-01 (UTC), against `he8um/oh-my-pm` at the v0.5.2
maintenance program. Verification is by GitHub REST API response, quoted in
summarized form. No token, secret, or complete raw payload appears here.

**Repository visibility:** public. Several controls below are available only
because of that; the availability notes say where.

---

## Summary

| Control                           | Before       | After     | Action      |
| --------------------------------- | ------------ | --------- | ----------- |
| `main` requires a pull request    | none         | required  | **changed** |
| Force-push to `main`              | allowed      | blocked   | **changed** |
| Deletion of `main`                | allowed      | blocked   | **changed** |
| Required status checks            | none         | 6 checks  | **changed** |
| Conversation resolution           | not required | required  | **changed** |
| Bypass access                     | n/a          | nobody    | **changed** |
| Merge commits available           | enabled      | enabled   | verified    |
| Delete branch on merge            | disabled     | enabled   | **changed** |
| Default branch                    | `main`       | `main`    | verified    |
| Actions default token             | read         | read      | verified    |
| Actions may approve pull requests | no           | no        | verified    |
| `github-release` environment      | protected    | protected | verified    |
| Secret scanning                   | enabled      | enabled   | verified    |
| Secret scanning push protection   | enabled      | enabled   | verified    |
| Dependabot alerts                 | disabled     | enabled   | **changed** |
| Dependabot security updates       | disabled     | enabled   | **changed** |
| Private vulnerability reporting   | disabled     | enabled   | **changed** |
| GitHub Discussions                | disabled     | disabled  | unchanged   |
| Secret scanning validity checks   | disabled     | disabled  | not adopted |
| Non-provider secret patterns      | disabled     | disabled  | not adopted |

---

## Branch protection for `main`

**Mechanism: repository ruleset, not classic branch protection.**

No classic protection and no ruleset existed before this change
(`GET /repos/he8um/oh-my-pm/branches/main/protection` → `404 Branch not
protected`; `GET /rulesets` → `[]`). A ruleset was chosen as the single
enforcement mechanism: it is the current GitHub model, it reports which rules
apply to a ref, and layering a classic rule on top would create two
independently editable sources of the same policy. **Exactly one mechanism is in
use** — no classic branch protection was added.

- **Ruleset:** `main protection`, id **20203670**
- **Target:** `~DEFAULT_BRANCH` (follows `main` if the default is ever renamed)
- **Enforcement:** `active`

Rules, verified by `GET /repos/he8um/oh-my-pm/rules/branches/main` returning
`["deletion", "non_fast_forward", "pull_request", "required_status_checks"]`:

| Rule                     | Effect                                             |
| ------------------------ | -------------------------------------------------- |
| `deletion`               | `main` cannot be deleted                           |
| `non_fast_forward`       | force-push to `main` is blocked                    |
| `pull_request`           | direct pushes rejected; a pull request is required |
| `required_status_checks` | the six checks below must pass before merge        |

Pull-request parameters:

- `required_approving_review_count: 0` — see the note below
- `required_review_thread_resolution: true` — conversations must be resolved
- `require_code_owner_review: false` — see the note below
- `allowed_merge_methods: ["merge", "squash"]` — rebase is excluded so a
  structured multi-commit history cannot be flattened by accident

**Bypass:** `bypass_actors: []`, and the API reports
`current_user_can_bypass: "never"` for the repository owner. Nobody can push
past these rules, including the maintainer.

### Why zero required approvals

GitHub does not count a review from a pull request's own author. In a
single-maintainer repository, requiring one approval makes every pull request
permanently unmergeable: the only person who could approve is the only person
who cannot. Requiring code owner review has the same effect, since the sole code
owner is also the sole author.

This is a deliberate, documented trade, and it is not the same as "no
protection". What still holds without an approval count:

- every change goes through a pull request — no direct push to `main`;
- all six required checks must pass, including cross-platform installed
  qualification;
- every review conversation must be resolved before merge;
- force-push and deletion are blocked;
- nobody can bypass any of it.

`.github/CODEOWNERS` therefore exists as routing and documentation — automatic
review requests and an explicit record of the sensitive paths — rather than as a
merge gate. It becomes enforceable the moment a second maintainer exists: raise
`required_approving_review_count` to 1 and set `require_code_owner_review: true`.

### Required status checks

Six checks, all produced by GitHub Actions (`integration_id: 15368`). Every name
was taken from a run that **actually completed on `main`** — the merge commit
`9656ca6` — rather than transcribed from a workflow file:

| Check                                      | Workflow                     |
| ------------------------------------------ | ---------------------------- |
| `validate`                                 | CI                           |
| `Windows release install smoke`            | CI                           |
| `Prepare candidate artifact`               | v0.5 Installed Qualification |
| `Installed qualification (ubuntu-latest)`  | v0.5 Installed Qualification |
| `Installed qualification (macos-latest)`   | v0.5 Installed Qualification |
| `Installed qualification (windows-latest)` | v0.5 Installed Qualification |

The three matrix names embed `${{ matrix.os }}`, which expands to a fixed,
stable string per platform — they are not dynamically generated names.

`strict_required_status_checks_policy: false`: a branch is **not** forced to be
up to date with `main` before merging. With a single maintainer and a linear,
low-traffic history, requiring a rebase-and-rewait on every intervening merge
costs a full cross-platform qualification cycle per iteration and buys little.
Merge-commit CI runs on `main` after every merge and is checked, which is what
actually catches a semantic conflict between two independently green branches.

**Verified against a real pull request:** with the ruleset active, PR #37
reported `mergeStateStatus: BLOCKED` until its required checks completed, so the
rules demonstrably apply to ordinary pull requests and not only in theory.

---

## Merge settings

| Setting                  | State  |
| ------------------------ | ------ |
| `allow_merge_commit`     | `true` |
| `allow_squash_merge`     | `true` |
| `allow_rebase_merge`     | `true` |
| `delete_branch_on_merge` | `true` |
| `default_branch`         | `main` |

`delete_branch_on_merge` was `false` and is now `true`, so merged working
branches are removed automatically instead of accumulating.

Squash and rebase remain enabled at the repository level, but the ruleset
restricts what can actually be used on `main` to **merge** and **squash**. The
project convention is unchanged: feature, release, migration, and multi-commit
pull requests use merge commits; a typo-only pull request may use squash when
deliberately chosen. Rebase merging is excluded because it would rewrite a
structured commit history that is meant to stay reviewable.

---

## Actions permissions

| Setting                            | State   |
| ---------------------------------- | ------- |
| `default_workflow_permissions`     | `read`  |
| `can_approve_pull_request_reviews` | `false` |
| Actions enabled                    | `true`  |
| `allowed_actions`                  | `all`   |

Both were already correct and were verified, not changed. The default
`GITHUB_TOKEN` is read-only, so a workflow that needs to write must ask for it
explicitly at the job that needs it.

Workflow-level permissions were re-read and remain least-privilege: `ci.yml`,
`v0.5-installed-qualification.yml`, and the `prepare` and
`installed-qualification` jobs of `release-v0.5.yml` all declare
`contents: read`. **Only** the `publish` job declares `contents: write`, and
only that job is environment-protected.

`allowed_actions: all` is unchanged. Restricting it to verified/selected actions
would be a further tightening, but the workflows already pin actions to specific
major versions and the change is out of scope for this maintenance program.

---

## Release environment

`github-release`, verified by
`GET /repos/he8um/oh-my-pm/environments/github-release`:

| Protection rule      | Value       |
| -------------------- | ----------- |
| `required_reviewers` | `he8um`     |
| `branch_policy`      | `main` only |

- The environment exists and **requires explicit approval** before the job runs.
- Only the `publish` job of `release-v0.5.yml` targets it, and that job is the
  only one granted `contents: write`.
- The deployment branch policy admits **only `main`**, so no unprotected branch
  can publish through it.
- No environment secret is defined; publication uses the job's scoped
  `GITHUB_TOKEN`. There is no registry credential to leak.

This protection was already in place, was verified rather than created, and is
**not** removed or weakened after publication.

---

## Security features

| Feature                         | State     | Evidence                                                     |
| ------------------------------- | --------- | ------------------------------------------------------------ |
| Secret scanning                 | `enabled` | `security_and_analysis.secret_scanning`                      |
| Secret scanning push protection | `enabled` | `security_and_analysis.secret_scanning_push_protection`      |
| Dependabot alerts               | `enabled` | `GET /vulnerability-alerts` → `204 No Content`               |
| Dependabot security updates     | `enabled` | `security_and_analysis.dependabot_security_updates`          |
| Private vulnerability reporting | `enabled` | `GET /private-vulnerability-reporting` → `{"enabled": true}` |

All are available because the repository is public; none incurs a billing
commitment.

Secret scanning and push protection were already enabled and were verified.
Dependabot alerts, Dependabot security updates, and private vulnerability
reporting were **disabled** and were enabled during this program:

- Dependabot alerts: `PUT /repos/he8um/oh-my-pm/vulnerability-alerts` →
  `204`; re-read returns `204` (the endpoint returns `404` when disabled, which
  is what it returned beforehand).
- Dependabot security updates: `PUT /automated-security-fixes` → `204`;
  re-read shows `"dependabot_security_updates": {"status": "enabled"}`.
- Private vulnerability reporting: `PUT /private-vulnerability-reporting` →
  `204` at **2026-08-01T21:08:12Z**; re-read returns `{"enabled": true}`.

Private vulnerability reporting was enabled **before** `SECURITY.md` was
rewritten to point at it, so that document never promised a channel that did not
exist.

### Not adopted

| Feature                         | State      | Why                                                                                                                                                                          |
| ------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret scanning validity checks | `disabled` | Sends candidate secrets to the issuing provider to test whether they are live. Not adopted without a deliberate decision about that egress.                                  |
| Non-provider secret patterns    | `disabled` | Generic-pattern scanning is noisy on a repository whose fixtures and tests deliberately contain token-shaped placeholder strings.                                            |
| GitHub Discussions              | `disabled` | Not part of the support model. `SUPPORT.md` says so explicitly rather than pointing users at a disabled tab. Enabling a channel nobody watches is worse than not having one. |

None of these is unavailable — each is a deliberate decision to leave off.

### Nothing was unavailable

Every control this program set out to configure was available on this
repository's plan and visibility. No item is recorded as `not_available`.

---

## What is enforced in files, not here

For completeness, the controls that live in the repository rather than in GitHub
settings, since they carry part of the same policy:

- `.github/CODEOWNERS` — ownership of sensitive paths (informational; see above).
- `.github/dependabot.yml` — update policy for npm, Cargo, and GitHub Actions.
- `.github/workflows/*.yml` — per-job `permissions`, `timeout-minutes`, and
  concurrency; `tools/test/quality-policy.test.mjs` asserts these and fails if a
  timeout is dropped, a release workflow becomes cancelable, or a frozen-lockfile
  install is reverted.
- `release-state.json` — the release lifecycle contract, validated offline by
  `pnpm validate:docs`.

---

## Re-verification

These commands re-read every hosted control above. They are all read-only.

```bash
REPO=he8um/oh-my-pm

# Branch protection
gh api "repos/$REPO/rules/branches/main" --jq '[.[].type]'
gh api "repos/$REPO/rulesets/20203670" \
  --jq '{enforcement, bypass_actors, current_user_can_bypass}'

# Merge settings
gh api "repos/$REPO" \
  --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge,
         delete_branch_on_merge, default_branch, has_discussions}'

# Actions
gh api "repos/$REPO/actions/permissions/workflow"

# Release environment
gh api "repos/$REPO/environments/github-release" \
  --jq '[.protection_rules[] | {type, reviewers: (.reviewers // [] | map(.reviewer.login))}]'

# Security features
gh api "repos/$REPO" --jq '.security_and_analysis'
gh api "repos/$REPO/private-vulnerability-reporting"
gh api "repos/$REPO/vulnerability-alerts" -i | head -1   # 204 enabled, 404 disabled
```
