# GitHub item comments

OH MY PM can optionally include the ordinary **conversation comments** of a
single selected GitHub issue or pull request in the existing read-only
workflows. Comments are **disabled by default** and are only available for the
`item` source. Enabling them adds exactly one extra read-only request.

## Scope

Only ordinary issue/PR conversation comments are included, via a single call to:

```text
GET /repos/{owner}/{repo}/issues/{number}/comments
```

The following are **explicitly excluded** in this phase:

- pull-request review comments
- pull-request reviews
- timeline / events
- commit comments
- commits, files, or diffs
- reactions
- any write operation

## Usage

### CLI

```bash
oh-my-pm github risks owner/repo \
  --source item \
  --number 123 \
  --include-comments \
  --comment-limit 20 \
  --markdown
```

- `--include-comments` — opt in (a boolean flag). Without it, no comments are
  fetched.
- `--comment-limit <1..50>` — how many comments to request (default `20`). Only
  valid together with `--include-comments`.

Both options are only valid with `--source item`. Using them with any other
source, or supplying `--comment-limit` without `--include-comments`, is an error
that fails before any token read, clock read, transport construction, or network
request.

### MCP

The four GitHub workflow tools (`github_project_brief`, `github_project_risks`,
`github_project_next`, `github_project_handoff`) accept the same options:

```jsonc
{
  "repository": "owner/repo",
  "source": "item",
  "number": 123,
  "includeComments": true,
  "commentLimit": 20
}
```

No new tools are added and the tool order is unchanged.

## What comments contribute

A comment is classified as exactly `source=github`, `type=note`,
`kind=issueComment`. Comments never become top-level issues, pull requests, or
repositories, are never overdue, and are never label-based risks or tasks.

- **Risks** — extracted only from recognized Markdown risk headings
  (blockers / risks / dependencies) and explicit
  `risk:` / `blocker:` / `dependency:` / `concern:` markers (English and
  Persian). Arbitrary prose and comment titles never count.
- **Next tasks** — extracted only from unchecked checkboxes, recognized action
  headings, and explicit `action:` / `next:` / `task:` markers. Comment tasks
  are allowed only when the parent issue is open or the parent PR is open or
  draft.
- **Handoff** — comment-derived entries may appear under Open Tasks, Risks, and
  Decisions, prefixed with the comment author (`@alice: …`). Comments never
  change the project title, Summary, counts, or top-level highlights.
- **Status** — comment notes never change total/open/done/blocked counts, and
  comment titles never become highlights.

## Bounds and safety

- At most **50** comments are ever normalized (one page; no pagination).
- Each comment body is bounded to **8,000** characters; the combined comment
  bodies to **64,000** characters. Earlier comments are preserved first, and
  truncation or invalid-record conditions emit stable warnings.
- Comment metadata exposed through MCP is limited to
  `id`, `author`, `createdAt`, `updatedAt`, and `url` — never the comment body,
  and never a raw provider object, token, header, or internal trace.
- If explicitly requested comments cannot be fetched, the workflow fails through
  the existing sanitized provider error taxonomy; there is no silent fallback.

Comments cannot be enabled through provider configuration, and no comment data
is stored, cached, or written to any project or configuration file.
