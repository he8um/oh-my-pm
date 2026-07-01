# Jira Connector

This document defines the Phase 12 scope for the Oh My PM Jira connector.

No write actions are implemented. This connector is read-only.

---

## Purpose

Give the Oh My PM MCP server access to live Jira site, project, board, and
issue data for delivery diagnosis, issue backlog review, sprint/board
review, risk review, handoff generation, and delivery status summarization.

The connector reads from a configured Jira Cloud site using the Jira Cloud
REST API (`/rest/api/3` for issues/projects, `/rest/agile/1.0` for
boards/sprints). It translates raw issue/board data into delivery-management
language: open work, stale work, blocked work, unassigned work, missing
estimates, missing sprint assignment, unclear statuses, and handoff gaps.

Jira authenticates with HTTP Basic auth using an account email plus an API
token — unlike GitHub, ClickUp, Airtable, and Linear, which all use a single
bearer-style token. This connector isolates that auth construction inside
the client module and never exposes the email or token in output.

---

## Read-only-first policy

All v0.12.0 Jira connector tools are read-only.

No tool in this connector creates, updates, deletes, comments on, or
transitions any Jira resource (issue, comment, project, board, sprint, or
workflow). The connector calls only Jira REST `GET` endpoints — no `POST`,
`PUT`, `PATCH`, or `DELETE` request is ever sent.

Write capability requires all five conditions from `docs/mcp-security-policy.md`
before it can be added. None of those conditions are met in v0.12.0.

---

## Supported Jira surfaces

| Surface | Supported in v0.12.0 |
| --- | --- |
| Site identity (configured base URL) | Yes |
| Projects (list) | Yes |
| Issues in a configured project (list, bounded, JQL search) | Yes |
| Single issue detail (get by key, e.g. `PROJ-123`) | Yes |
| Issue status, assignee, priority, story points estimate, labels | Yes |
| Boards in a configured project (list) | Yes |
| Active sprint status for a configured board (issue counts, completion rate) | Yes |

---

## Unsupported Jira surfaces

| Surface | Why not in v0.12.0 |
| --- | --- |
| Jira Data Center / Server | Out of scope — v0.12.0 targets Jira Cloud REST API only |
| Comments (fetched by default) | Not fetched by default — reduces token cost |
| Custom field mapping | Out of scope per connector roadmap — custom fields vary too much between organizations for a reliable default |
| Jira Confluence integration | Out of scope per connector roadmap |
| Jira Service Management | Out of scope per connector roadmap |
| Attachments | Out of scope — no attachment access of any kind |
| Issue link / dependency graphs | Not resolved — linked issues are listed by key only, not expanded |
| Webhooks | Out of scope — no background polling or receivers |
| Workflow scheme / permission scheme management | Out of scope |
| Write operations of any kind | Hard boundary — not in v0.12.0 |

---

## Required configuration

```txt
OH_MY_PM_JIRA_BASE_URL=<https://yourorg.atlassian.net>   # required — identifies the Jira Cloud site
OH_MY_PM_JIRA_EMAIL=<account-email>                       # required — paired with the token for Basic auth
OH_MY_PM_JIRA_TOKEN=<api-token>                           # required — no useful read without it
OH_MY_PM_JIRA_PROJECT_KEY=<project-key>                   # required — scopes issue/board reads
```

Jira's REST API requires authentication for all useful endpoints. There is
no unauthenticated/public fallback (same as the ClickUp, Airtable, and
Linear connectors, unlike the GitHub connector). When the token or email is
missing, the connector returns an actionable degraded response instead of
crashing or attempting an unauthenticated request.

---

## Optional configuration

```txt
OH_MY_PM_JIRA_BOARD_ID=<board-id>     # default board for board/sprint-scoped tools
OH_MY_PM_JIRA_SPRINT_ID=<sprint-id>   # reserved — v0.12.0 always resolves the active sprint for the configured board
```

Reserved for future use, documented for planning purposes only — not read by
any v0.12.0 tool:

```txt
OH_MY_PM_JIRA_SITE_ID=<site-id>
OH_MY_PM_JIRA_CLOUD_ID=<cloud-id>
```

Tools that need a board accept it as an explicit input parameter
(`board_id`); when omitted they fall back to `OH_MY_PM_JIRA_BOARD_ID`.
Board-scoped tools without any board available return an actionable
`config_missing` error.

---

## Least-privilege token guidance

Use a Jira Cloud API token scoped to the minimum access needed to read the
target project:

- Create the API token from an account with member-level (not site-admin)
  project access when only read access is needed.
- Scope usage to the project(s) actually used with Oh My PM by setting
  `OH_MY_PM_JIRA_PROJECT_KEY` rather than iterating over every project on
  the site.
- The connector does not need and will never call a Jira write endpoint
  (`POST`, `PUT`, `PATCH`, `DELETE`), including issue transitions.

---

## No credential storage policy

The email and token are provided via environment variables at server
startup. They are:

- Never stored between restarts
- Never logged
- Never returned in MCP tool output
- Never included in error messages
- Never included in repository files

The configured email is used only to construct the Basic auth header
internally — it is not included in any tool output field. Tool responses
identify the connector by `data_source: "jira"` and by project/board
identifiers, never by the account email.

---

## No write actions policy

This connector does not and will not support write actions in v0.12.0:

```txt
create issue            — not implemented
update issue             — not implemented
delete issue              — not implemented
create comment            — not implemented
update comment             — not implemented
delete comment              — not implemented
transition issue              — not implemented
change status                  — not implemented
change assignee                 — not implemented
change priority                  — not implemented
change estimate                   — not implemented
change sprint                      — not implemented
change label                        — not implemented
create project                       — not implemented
update project                        — not implemented
delete project                         — not implemented
create board                            — not implemented
update board                             — not implemented
delete board                              — not implemented
create sprint                              — not implemented
update sprint                               — not implemented
delete sprint                                — not implemented
create webhook                                — not implemented
update webhook                                 — not implemented
delete webhook                                  — not implemented
```

Any future write action requires separate policy documentation and review per
`docs/mcp-security-policy.md`.

---

## Failure / degraded behavior

| Failure | Connector behavior |
| --- | --- |
| Token or email missing | Returns `status: "degraded"`, `error_code: "auth_required"`, actionable message |
| Base URL missing | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| Project key missing | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| Board missing (board/sprint-scoped tool, no default configured) | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| HTTP 401 | Returns `status: "error"`, `error_code: "auth_failed"` — does not expose token or email |
| HTTP 403 | Returns `status: "error"`, `error_code: "permission_denied"` |
| HTTP 404 (project/board/issue not found) | Returns `status: "error"`, `error_code: "resource_not_found"` |
| HTTP 429 | Returns `status: "error"`, `error_code: "rate_limited"`, includes retry hint |
| No active sprint on configured board | Returns `status: "ok"` with `sprint: null` and a note in `limitations` — not treated as an error |
| Network error | Returns `status: "error"`, `error_code: "network_error"`, safe message |
| Unexpected API error | Returns `status: "error"`, `error_code: "api_error"`, safe message only |

The MCP server never crashes on connector error. The agent continues without
Jira data and informs the user.

---

## Rate-limit behavior

- The connector reads `x-ratelimit-remaining` and `retry-after` headers from
  Jira API responses when present.
- If remaining requests fall below 10, the tool response includes a
  `rate_limit_warning` field.
- If rate limited (429), the tool returns a structured error with a retry
  hint derived from `retry-after` when available.
- No retry loop — the connector returns the error immediately for the agent
  to handle.

---

## Pagination and item limits

- Default max items per list tool: 25
- Hard max items per list tool: 100 (enforced regardless of user request)
- Jira REST pagination (`startAt`/`maxResults`) is handled internally — the
  connector requests only up to the bounded limit per call, it does not walk
  multiple pages
- Long issue descriptions are truncated to 500 characters with a truncation
  note
- Comments and full custom field sets are not fetched by default

---

## Tool list

| Tool name | Description |
| --- | --- |
| `jira_list_issues` | List open issues in the configured project, with delivery tags (blocked, stale, unassigned, missing estimate, missing sprint) |
| `jira_summarize_issue` | Get a structured summary of a single issue by key |
| `jira_summarize_project_status` | Summarize the delivery status of a project: issue counts, status breakdown, blockers, stale issues, active sprint completion rate, next-action candidates |
| `jira_list_projects` | List projects accessible to the configured site |
| `jira_list_boards` | List boards in the configured project |

---

## Resource list

| Resource URI | Description |
| --- | --- |
| `jira://site/current` | Current configured site identity |
| `jira://projects` | Projects accessible to the configured site (bounded) |
| `jira://issues/open` | Open issues in the configured project (bounded) |

If the MCP SDK resource registration requires a distinct URI shape, the
literal URIs above are used as-is — the SDK accepts custom scheme URIs the
same way the `project://`, `github://`, `clickup://`, `airtable://`, and
`linear://` resources are already registered.

---

## Prompts

| Prompt | Description |
| --- | --- |
| `summarize-jira-delivery-status` | Delivery status using Jira issue/board/sprint data |
| `diagnose-jira-issue-backlog` | Issue backlog diagnosis using delivery semantics (blocked, stale, unassigned, missing estimate) |
| `prepare-jira-project-handoff` | Handoff prompt seeded with current Jira issue/project context |

---

## Delivery semantics

The connector translates Jira project/board/sprint/issue data into
delivery-management language. Where data allows, it identifies:

```txt
open work               — issues whose status category is not "Done"
stale work              — issues with no update in >14 days
blocked work            — issues whose status name matches a blocked pattern, or with a "blocked" label
unassigned work         — issues with no assignee
missing estimates       — issues with no story points value set
missing sprint          — issues not assigned to any sprint
overdue issue risk      — issues with a due date in the past and not in a "Done" status category
unclear statuses        — status names that do not map to a known status category (To Do/In Progress/Done)
missing priorities      — issues with no priority set
dependency risk         — not computed in v0.12.0 (Jira issue links are not read)
handoff gaps            — unassigned + missing-estimate issues combined
next-action candidates  — oldest stale or overdue open issues
```

Dependency risk is explicitly not computed in v0.12.0 — the connector does
not read Jira issue links (blocks/is blocked by/relates to). This is stated
in tool output `limitations` fields rather than silently omitted.

Because custom fields vary by Jira instance, story point estimates are read
from the commonly-used `customfield_10016` fallback pattern only when the
standard Agile API sprint/estimate fields are unavailable; when neither is
present the issue is tagged `missing_estimate` rather than guessing further.
This heuristic is stated in `assumptions` on every relevant tool response.

The connector does not overpromise analysis when data is unavailable — every
tool response includes `assumptions` and, where relevant, `limitations`
fields.

---

## Test approach

All tests use mocked HTTP responses. No real Jira API calls in tests.

Tests cover:

- Config loading (valid, missing base URL, missing email, missing token,
  missing project key)
- Each tool with a mocked success response
- Each tool with missing token/email (degraded response)
- Each tool with missing project/board config (actionable error)
- Each tool with 401/403/404/429 error responses
- No active sprint on the configured board (ok response, not an error)
- Pagination limit enforcement
- Issue description truncation
- Token and email redaction from error output
- Read-only policy (no write tool names exist, Jira tool descriptions do not
  promise writes, only `GET` requests are issued)
- Delivery tag extraction (blocked, stale, unassigned, missing estimate,
  missing sprint)

---

## Future write-capability policy

Write capability for the Jira connector is explicitly out of scope in
v0.12.0.

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
- `docs/github-connector.md`
- `docs/clickup-connector.md`
- `docs/airtable-connector.md`
- `docs/linear-connector.md`
- `packages/mcp-server/README.md`
