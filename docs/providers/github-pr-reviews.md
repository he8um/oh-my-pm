# GitHub pull-request reviews and review comments

OH MY PM can optionally include a single selected **pull request's** review
submissions and inline review comments in the existing read-only workflows.
Reviews and review comments are **disabled by default**, available only for the
`item` source, and only when the selected item is a **pull request**. Each
enabled context adds exactly one extra read-only request (a single page).

The ordinary conversation comments remain independently available via
`--include-comments` / `--comment-limit` (see
[GitHub item comments](github-item-comments.md)).

## Scope

Only two read-only endpoints are ever added, each fetched at most once:

```text
GET /repos/{owner}/{repo}/pulls/{number}/reviews
GET /repos/{owner}/{repo}/pulls/{number}/comments
```

These represent review submissions and inline pull-request review comments.
The following are **explicitly excluded**:

- timeline / events
- review-thread graph / resolution state
- reactions
- review requests
- commits, changed files, diff hunks, patches, or file contents
- checks / statuses, deployments, GitHub Projects
- any write operation

## Usage

### CLI

```bash
oh-my-pm github risks owner/repository \
  --source item \
  --number 123 \
  --include-reviews \
  --review-limit 10 \
  --include-review-comments \
  --review-comment-limit 10 \
  --markdown
```

- `--include-reviews` — opt in to review submissions (a boolean flag).
- `--review-limit <1..20>` — how many reviews to request (default `10`). Only
  valid together with `--include-reviews`.
- `--include-review-comments` — opt in to inline review comments.
- `--review-comment-limit <1..20>` — how many inline review comments to request
  (default `10`). Only valid together with `--include-review-comments`.

All four options are valid **only** with `--source item`. Using them with any
other source, or supplying a limit without its include flag, is an error that
fails before any token read, clock read, transport construction, or network
request. An issue selected with review options is rejected only after the first
GitHub item request identifies it as an issue: the workflow returns exit code 2
with the sanitized message `selected item is not a pull request` (reason
`github_pull_request_required`) and makes **no** pull-request endpoint request.

### MCP

The four GitHub workflow tools (`github_project_brief`, `github_project_risks`,
`github_project_next`, `github_project_handoff`) accept the same options:

```jsonc
{
  "repository": "owner/repository",
  "source": "item",
  "number": 123,
  "includeReviews": true,
  "reviewLimit": 10,
  "includeReviewComments": true,
  "reviewCommentLimit": 10
}
```

No new tools are added and the exact ten-tool surface and order are unchanged.

## Request order

For a pull-request item, requests are made in a fixed, deterministic order and
one page per endpoint:

1. `GET /repos/{slug}/issues/{number}` (item identification)
2. `GET /repos/{slug}/pulls/{number}` (PR detail)
3. optional `GET /repos/{slug}/issues/{number}/comments`
4. optional `GET /repos/{slug}/pulls/{number}/reviews`
5. optional `GET /repos/{slug}/pulls/{number}/comments`

Maximum requests: 2 (PR only), 3 (PR + one optional context), 5 (PR + all three
optional contexts). An issue selected with review options makes exactly 1 request
before the controlled failure. An explicitly requested endpoint failure fails the
whole workflow through the existing sanitized taxonomy — there is no
partial-success fallback.

## Review state

A review submission carries a canonical, sanitized state (the raw GitHub state
string is never exposed):

| GitHub state       | Canonical state    |
| ------------------ | ------------------ |
| `APPROVED`         | `approved`         |
| `CHANGES_REQUESTED`| `changesRequested` |
| `COMMENTED`        | `commented`        |
| `DISMISSED`        | `dismissed`        |
| `PENDING`          | `pending`          |
| anything else      | `unknown` (+ warning) |

For an **open or draft** parent pull request:

- `changesRequested` — produces one high-severity risk and one high next task.
- `approved` — produces no state-derived risk or task; contributes a handoff
  decision (`@alice approved the pull request`).
- `dismissed` — produces no risk or task; may contribute a handoff decision
  (`@alice review was dismissed`).
- `commented` / `pending` / `unknown` — produce no state-derived risk or task;
  a `commented` body may still contribute explicit Markdown signals.

For a **closed or merged** parent pull request, no state-derived risk or task is
produced. `approved`/`dismissed` may still contribute handoff decisions, and
explicit body risks may still be extracted as historical context (explicit body
tasks remain excluded by the terminal parent status). Changes-requested always
surfaces through the normal Risk / Open Task extraction, never as a decision.

## Explicit Markdown signals

Review and inline review-comment bodies contribute risk, task, and decision
signals **only** through the recognized Markdown structures already used
elsewhere: risk/blocker/dependency/concern headings and markers, unchecked
checkboxes, recognized action headings and markers, and recognized decision
headings/markers (English and Persian). Arbitrary prose is never classified, and
a review's generated title never becomes a signal.

Reviews and review comments never become top-level issues, pull requests, or
repositories; never use issue/PR label taxonomy or overdue logic; never change
status counts, highlights, top-level counts, or the project title; and never
replace an owner with the review author. In handoff output, review-derived lines
are author-prefixed (`@alice: …`) and inline review-comment lines add file
provenance (`@alice [src/file.ts:42]: …`, or `@alice [src/file.ts]: …` when the
line is unavailable).

## Bounds and safety

- At most **20** reviews and **20** inline review comments are ever normalized
  (one page each; no pagination).
- Each review body is bounded to **6,000** characters (combined **32,000**);
  each review-comment body to **8,000** characters (combined **48,000**). File
  paths are treated as display provenance only, stripped of control characters,
  trimmed, and capped at **512** characters — never resolved against the local
  filesystem or read.
- The maximum normalized item count for one item request stays within the
  provider's 100-item ceiling: `1 primary PR + 50 comments + 20 reviews +
  20 review comments = 91`.
- Review metadata exposed through MCP is limited to identity, sanitized state,
  and file/line provenance — never the review or review-comment body, a diff
  hunk, a commit id, a node id, a nested user, a raw provider object, a token, a
  header, or an internal trace.
- All new network behavior is explicit, GET-only, `api.github.com`-only,
  item-only, pull-request-only, single-page, bounded, and deterministic. There
  is no retry, concurrency, cache, background sync, or telemetry.

Reviews and review comments cannot be enabled through provider configuration,
and no review data is stored, cached, or written to any project or configuration
file.

## Deferred

Timeline events remain a separate, later bounded phase.
[F-TEST-1](../architecture/v0.2-stabilization-audit.md) (Windows source-removal
and prefix-relocation CI parity) remains a separate release-candidate
prerequisite and is not part of this feature.
