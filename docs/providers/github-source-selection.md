# GitHub source selection

The GitHub workflows (`brief`, `risks`, `next`, `handoff`) let you choose
exactly which read-only GitHub context is analyzed. The default preserves the
original behavior — a repository overview of open items — while explicit source
selection exposes the provider's `list`, `search`, and `fetch` capabilities as
first-class, strict source modes.

Everything here stays inside the existing read-only boundary: `GET`-only, fixed
`https://api.github.com` origin, pinned REST API version, no GraphQL, no
write-back, and a single API page per request. Local Markdown workflows remain
fully offline; a GitHub request happens only when you run a `github` command or
call a `github_project_*` MCP tool.

## Source modes

| source          | state | limit | number | query | kind |
| --------------- | ----- | ----- | ------ | ----- | ---- |
| overview        | yes   | yes   | no     | no    | no   |
| repository      | no    | no    | no     | no    | no   |
| issues          | yes   | yes   | no     | no    | no   |
| pull-requests   | yes   | yes   | no     | no    | no   |
| item            | no    | no    | yes    | no    | no   |
| search          | yes   | yes   | no     | yes   | yes  |

- **overview** — repository metadata plus issues and pull requests selected by
  state. This is the default (`overview` + `open`).
- **repository** — repository metadata only; no issues or pull requests.
- **issues** — issues only, selected by state; no repository record, no pull
  requests.
- **pull-requests** — pull requests only, selected by state; no repository
  record, no issues.
- **item** — one specific issue or pull request by number. The item type is
  auto-detected; pull requests are enriched through the pull-request detail
  request. This is the only source that reads a single item.
- **search** — repository-scoped GitHub issue/PR search. Requires a query, and
  is selected by state and search kind.

`state` is `open` (default), `closed`, or `all`. `kind` (search only) is `all`
(default), `issues`, or `pull-requests`. `limit` is `1..100` (default `50`).

The canonical values above are exact — there are no aliases such as `pr`,
`prs`, `issue`, `repo`, or a bare `all` source.

## CLI

```bash
# Default overview + open (unchanged behavior):
oh-my-pm github brief owner/repository --markdown

# Repository metadata only:
oh-my-pm github brief owner/repository --source repository --markdown

# Open issues only:
oh-my-pm github risks owner/repository --source issues --state open --limit 50 --markdown

# Closed pull requests only:
oh-my-pm github handoff owner/repository --source pull-requests --state closed --limit 25 --markdown

# One specific issue or pull request (type auto-detected):
oh-my-pm github brief owner/repository --source item --number 123 --markdown

# One item, optionally including its ordinary conversation comments (opt-in):
oh-my-pm github risks owner/repository --source item --number 123 \
  --include-comments --comment-limit 20 --markdown

# Repository-scoped search:
oh-my-pm github risks owner/repository \
  --source search --query "release blocker" --kind all --state open --limit 25 --markdown
```

Options that do not apply to the selected source are rejected with a stable
message before any network access — for example `--number` is only valid with
`--source item`, `--query`/`--kind` only with `--source search`, and `--state`/
`--limit` are not valid with `--source repository` or `--source item`.

`--include-comments` and `--comment-limit` (`1..50`, default `20`) are only
valid with `--source item`; `--comment-limit` requires `--include-comments`.
Comments are disabled by default and add a single extra read-only request. See
[GitHub item comments](github-item-comments.md).

## MCP

The same model is available on the four existing GitHub workflow tools
(`github_project_brief`, `github_project_risks`, `github_project_next`,
`github_project_handoff`) — no new tools are added. Their input accepts optional
`repository`, `limit`, `source`, `state`, `number`, `query`, `kind`,
`includeComments`, and `commentLimit` (the last two apply only to the item
source):

```json
{
  "repository": "owner/repository",
  "source": "search",
  "query": "release blocker",
  "kind": "all",
  "state": "open",
  "limit": 25
}
```

The successful result includes a sanitized `selection` summary (the mode plus
the applicable state/kind/number/query/limit). It never contains the internal
provider query, the GitHub REST query string, a token, a config path, headers,
raw provider bodies, or a Runtime trace.

## Configuration defaults

Provider configuration may set a default source and state (but never `item` or
`search`, which require per-invocation data):

```json
{
  "version": 1,
  "providers": {
    "github": {
      "enabled": true,
      "defaultRepository": "owner/repository",
      "defaultLimit": 50,
      "defaultSource": "overview",
      "defaultState": "open"
    }
  }
}
```

Explicit CLI/MCP values always override configuration. Item numbers and search
queries are never stored in configuration. See
[provider configuration](./configuration.md).

## Limitations in this phase

- One API page per request; the maximum is 100 items.
- No review comments, timelines, commits, files, diffs, patches, releases,
  workflows, refs, labels-as-entities, milestones-as-entities, or GitHub
  Projects retrieval. (Ordinary issue/PR conversation comments are supported for
  the `item` source only, opt-in and disabled by default — see
  [GitHub item comments](github-item-comments.md).)
- Issues/pull-requests/search list modes use the GitHub search endpoint and do
  not enrich each pull request with file/diff counts (only the `item` source
  enriches a single pull request).
- No GraphQL, no write-back, no aliases/profiles, and no arbitrary API URL.
- User search terms cannot override the provider-injected repository, state, or
  issue/PR scope.
