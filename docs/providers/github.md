# GitHub read-only provider

The GitHub provider adds real external context to OH MY PM while staying strictly
read-only and explicitly opt-in. Local Markdown project workflows remain fully
offline; a GitHub request happens only when you run a `github` command or call a
`github_project_*` MCP tool.

## Scope and safety

- **Read-only.** The provider issues `GET` requests only. It never creates or
  edits issues, comments, pull requests, labels, milestones, projects, releases,
  commits, refs, or workflow runs, and never sends `POST`/`PUT`/`PATCH`/`DELETE`.
- **Fixed origin.** All requests go to `https://api.github.com`. There is no
  GitHub Enterprise or custom-origin support in this phase.
- **Pinned API version.** Every request sends `X-GitHub-Api-Version: 2026-03-10`
  and `Accept: application/vnd.github+json`.
- **No GraphQL** in this phase — REST only.
- **Explicit network opt-in.** No request is made at process startup or during
  MCP tool discovery. The network is touched only when a GitHub command/tool runs.

## Endpoints used

```text
GET /repos/{owner}/{repo}
GET /repos/{owner}/{repo}/issues
GET /repos/{owner}/{repo}/issues/{issue_number}
GET /repos/{owner}/{repo}/pulls/{pull_number}
GET /search/issues
```

An item from the repository issues endpoint is classified as a pull request when
it carries a `pull_request` field.

## Authentication

Public repositories work without any token, subject to GitHub's unauthenticated
rate limits. For private repositories or a higher rate limit, provide a token in
the environment:

```bash
export OH_MY_PM_GITHUB_TOKEN="<fine-grained read-only token>"
```

- The token is optional and used only as a `Bearer` Authorization header on the
  outbound request.
- There is **no** `--token` CLI argument and **no** API-URL argument.
- The token is never persisted, never printed, and never included in errors,
  JSON, MCP output, logs, snapshots, or reports.
- The provider package never reads the environment; the token is injected by the
  process adapter at the command/tool boundary.

### Recommended token permissions

Use a fine-grained personal access token scoped to the repositories you need,
with the minimum practical read permissions:

- **Metadata:** read
- **Issues:** read
- **Pull requests:** read (or **Contents:** read where GitHub requires it)

## Limit behavior

- `--limit` (CLI) / `limit` (MCP) defaults to `50`.
- The accepted range is `1..100`; values outside it are rejected.
- A single page is fetched (`page=1`); there is no pagination beyond page one in
  this phase, so the effective maximum is 100 items.
- For `list`, the repository metadata item consumes one slot from the limit.

## Body and response bounds

- Issue and pull-request bodies are raw Markdown, truncated to 32,000 characters;
  truncation adds a warning without echoing the truncated content.
- Responses are bounded to 4 MiB and must be valid JSON, or the request fails
  with `OMP-P-4009`.
- HTML bodies are never used; only the raw Markdown `body` field is normalized.

## Rate limits

Rate-limit state is read from actual response headers (`x-ratelimit-*`,
`retry-after`); the provider never calls `/rate_limit`. On `403`/`429` with
rate-limit evidence the result maps to `OMP-P-4007`. The provider never sleeps
and never retries automatically.

## Error codes

| Code | Meaning |
| --- | --- |
| `OMP-P-4003` | invalid request (bad repository/limit/query, or a `422` from GitHub) |
| `OMP-P-4004` | authentication failed (`401`) |
| `OMP-P-4005` | access forbidden (`403` without rate-limit evidence) |
| `OMP-P-4006` | resource not found (`404`/`410`) |
| `OMP-P-4007` | rate limited (`403`/`429` with rate-limit evidence) |
| `OMP-P-4008` | transport failed (timeout, DNS, connection, abort, redirect rejection) |
| `OMP-P-4009` | invalid response (malformed JSON, oversized, wrong shape) |

## Deterministic extraction over GitHub context

Normalized issues and pull requests feed the same deterministic risk and
next-task extraction as local Markdown. Exact label and status rules apply
(never substring matching), overdue is inferred from the injected timestamp,
repository records are never next tasks, blocked/closed/merged/no-action items
are excluded from next tasks, and at most one risk is produced per issue/PR. The
public output carries `url`, `repository`, `number`, `owner`, `due`, and (for
next tasks) `priority`, but never raw issue/PR bodies. See
[the deterministic extraction guide](../deterministic-extraction.md).

## CLI examples

```bash
# Public repository (no token needed):
oh-my-pm github brief owner/repository --markdown
oh-my-pm github risks owner/repository --markdown
oh-my-pm github next owner/repository --markdown
oh-my-pm github handoff owner/repository --markdown

# Private repository or higher rate limit:
export OH_MY_PM_GITHUB_TOKEN="<fine-grained read-only token>"
oh-my-pm github brief owner/private-repository --limit 50 --markdown
```

## MCP tools

The server exposes four GitHub tools after the four local project tools:

```text
github_project_brief
github_project_risks
github_project_next
github_project_handoff
```

Each accepts an optional `repository` in `owner/repo` form and an optional
`limit` (1..100, default 50); when omitted, the configured `providers.json`
defaults are used, and explicit values override them. There is no token,
API-URL, config-path, arbitrary-query, or local-root input. The operator
supplies `OH_MY_PM_GITHUB_TOKEN` to the MCP server process environment when a
token is needed; the generic MCP client-config generator never inserts secrets.
Server startup and `tools/list` never make a GitHub request — a request happens
only when one of these tools is called.

## Source selection

The four GitHub workflows choose which read-only context to analyze through a
strict source-selection model: `overview` (default), `repository`, `issues`,
`pull-requests`, a single `item` (issue/PR with type auto-detection), and
repository-scoped `search`, each with `open`/`closed`/`all` state and a search
`kind`. It stays `GET`-only, single page, and never fetches comments, timelines,
or diffs. See [GitHub source selection](./github-source-selection.md).

## Provider configuration and diagnostics

The GitHub repository, limit, default source, and default state can be supplied
per command/tool or as defaults in an optional, strictly read-only
`providers.json`. The origin, API version, method, and token environment
variable stay fixed and are never configurable, and no secret is ever permitted
in the file. Offline `providers status` / `providers doctor` commands and an
explicitly confirmed single-request GitHub access diagnostic are available. See
[provider configuration](./configuration.md) and
[provider diagnostics](./diagnostics.md).

## Local workflows remain offline

Running `oh-my-pm status`, `oh-my-pm doctor`, and the Markdown project workflows
(`brief`, `risks`, `next`, `handoff` over a local project root) makes no network
request and reads no token. Only the explicit `github` command and
`github_project_*` tools reach the network, and only over read-only HTTPS to
`api.github.com`.
