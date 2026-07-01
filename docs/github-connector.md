# GitHub Issues / Projects Connector

This document defines the Phase 8 scope for the Oh My PM GitHub connector.

No write actions are implemented. This connector is read-only.

---

## Purpose

Give the Oh My PM MCP server access to live GitHub issue and milestone data
for delivery diagnosis, risk review, handoff generation, and delivery status
summarization.

The connector reads from a configured GitHub repository using the GitHub REST
API. It translates raw issue/project data into delivery-management language:
open work, stale work, blocked work, unassigned work, overdue milestones, and
handoff gaps.

---

## Read-only-first policy

All v0.8.0 GitHub connector tools are read-only.

No tool in this connector creates, updates, closes, comments on, labels,
assigns, or deletes any GitHub resource.

Write capability requires all five conditions from `docs/mcp-security-policy.md`
before it can be added. None of those conditions are met in v0.8.0.

---

## Supported GitHub surfaces

| Surface | Supported in v0.8.0 |
| --- | --- |
| Open issues (list) | Yes |
| Issue detail (single) | Yes |
| Milestone list and status | Yes |
| Labels list | Yes |
| Repository context (name, description, default branch) | Yes |

---

## Unsupported GitHub surfaces

| Surface | Why not in v0.8.0 |
| --- | --- |
| Pull requests | Out of scope — code review, not delivery context |
| GitHub Projects v2 (GraphQL) | Deferred — REST Issues sufficient for v0.8.0 |
| GitHub Actions / workflows | Out of scope |
| Organization-level data | Out of scope |
| Repository code / file contents | Out of scope |
| Comments on issues | Not fetched by default — reduces token cost |
| Reactions | Out of scope |
| GitHub Discussions | Out of scope |
| Write operations of any kind | Hard boundary — not in v0.8.0 |

---

## Required configuration

```txt
OH_MY_PM_GITHUB_TOKEN=<personal-access-token>   # optional for public repos
OH_MY_PM_GITHUB_OWNER=<owner>                   # GitHub org or user name
OH_MY_PM_GITHUB_REPO=<repo>                     # repository name (no owner prefix)
```

`OH_MY_PM_GITHUB_TOKEN` is optional for public repositories. When absent, the
connector makes unauthenticated requests (lower rate limit: 60 requests/hour).
When present, rate limit is 5000 requests/hour.

---

## Optional configuration

```txt
OH_MY_PM_GITHUB_API_BASE_URL=<url>              # default: https://api.github.com
                                                # override for GitHub Enterprise
OH_MY_PM_GITHUB_PROJECT_NUMBER=<number>         # reserved for future Projects v2 support
```

---

## Least-privilege token guidance

The token should use the minimum required scopes:

- For public repositories: no scopes required (or no token at all)
- For private repositories: `repo` scope (read-only access)

Do not request write scopes. The connector does not need and will never use:

```txt
repo:write
issues:write
pull_requests:write
admin:org
```

---

## No credential storage policy

Tokens are provided via environment variables at server startup. They are:

- Never stored between restarts
- Never logged
- Never returned in MCP tool output
- Never included in error messages
- Never included in repository files

---

## No write actions policy

This connector does not and will not support write actions in v0.8.0:

```txt
create issue         — not implemented
update issue         — not implemented
close issue          — not implemented
reopen issue         — not implemented
create comment       — not implemented
edit comment         — not implemented
delete comment       — not implemented
add label            — not implemented
remove label         — not implemented
assign user          — not implemented
unassign user        — not implemented
move project item    — not implemented
update project field — not implemented
create milestone     — not implemented
update milestone     — not implemented
delete milestone     — not implemented
dispatch workflow    — not implemented
```

Any future write action requires separate policy documentation and review per
`docs/mcp-security-policy.md`.

---

## Failure / degraded behavior

| Failure | Connector behavior |
| --- | --- |
| Token missing (private repo) | Returns `status: "degraded"`, `error_code: "auth_required"`, actionable message |
| Token missing (public repo) | Continues with unauthenticated request, notes lower rate limit in response |
| Owner/repo missing | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| 401 Unauthorized | Returns `status: "error"`, `error_code: "auth_failed"` — does not expose token |
| 403 Forbidden | Returns `status: "error"`, `error_code: "permission_denied"` |
| 404 Not Found | Returns `status: "error"`, `error_code: "repo_not_found"` |
| 429 Rate Limited | Returns `status: "error"`, `error_code: "rate_limited"`, includes retry hint |
| Network error | Returns `status: "error"`, `error_code: "network_error"`, safe message |
| Unexpected API error | Returns `status: "error"`, `error_code: "api_error"`, safe message only |

The MCP server never crashes on connector error. The agent continues without
GitHub data and informs the user.

---

## Rate-limit behavior

- The connector reads `x-ratelimit-remaining` from GitHub API responses
- If remaining requests fall below 10, the tool response includes a `rate_limit_warning` field
- If rate limited (429 or `x-ratelimit-remaining: 0`), the tool returns a structured error
- No retry loop — the connector returns the error immediately for the agent to handle

---

## Pagination and item limits

- Default max items per list tool: 25
- Hard max items per list tool: 100 (enforced regardless of user request)
- Pagination is handled internally — the connector fetches pages until the limit is met
- Long issue bodies are truncated to 500 characters with a truncation note
- Comments are not fetched by default

---

## Tool list

| Tool name | Description |
| --- | --- |
| `github_list_issues` | List open GitHub issues with title, assignee, labels, state |
| `github_summarize_issue` | Get structured summary of a single issue by number |
| `github_list_milestones` | List open milestones with due date and completion percentage |
| `github_get_repository_context` | Get repository name, description, default branch, open issue count |

---

## Resource list

| Resource URI | Description |
| --- | --- |
| `github://issues/open` | Open issues list (bounded) |
| `github://milestones/open` | Open milestones with status |
| `github://repository/current` | Repository identity and metadata |

---

## Prompt list

| Prompt | Description |
| --- | --- |
| `summarize-github-delivery-status` | Delivery status using GitHub issue and milestone data |
| `diagnose-github-issue-backlog` | Issue backlog diagnosis using delivery semantics |

---

## Test approach

All tests use mocked HTTP responses. No real GitHub API calls in tests.

Tests cover:

- Config loading (valid, missing owner/repo, missing token)
- Each tool with mocked success response
- Each tool with missing token (degraded response)
- Each tool with 401/403/404/429 error responses
- Pagination limit enforcement
- Issue body truncation
- Token redaction from error output
- Read-only policy (no write tool names exist)
- Label/milestone data extraction

---

## Future write-capability policy

Write capability for the GitHub connector is explicitly out of scope in v0.8.0.

Before any write action is added, all five conditions from
`docs/mcp-security-policy.md` must be met:

1. Written policy for the specific action and connector
2. Explicit user confirmation at the MCP tool call layer
3. Per-connector safety review completed and documented
4. Rollback or undo path defined
5. Action scoped to the minimum necessary change

No write action will be added until all five conditions are satisfied.

---

## Related docs

- `docs/mcp-connector-roadmap.md`
- `docs/mcp-security-policy.md`
- `docs/mcp-interface-design.md`
- `docs/mcp-alpha-scope.md`
- `packages/mcp-server/README.md`
