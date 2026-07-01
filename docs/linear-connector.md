# Linear Connector

This document defines the Phase 11 scope for the Oh My PM Linear connector.

No write actions are implemented. This connector is read-only.

---

## Purpose

Give the Oh My PM MCP server access to live Linear workspace, team, project,
and issue data for delivery diagnosis, issue backlog review, risk review,
handoff generation, and delivery status summarization.

The connector reads from a configured Linear team using the Linear GraphQL
API (`api.linear.app/graphql`). It translates raw issue/project data into
delivery-management language: open work, stale work, blocked work,
unassigned work, missing estimates, missing cycles, unclear states, and
handoff gaps.

Linear's API is GraphQL, not REST. Unlike the GitHub, ClickUp, and Airtable
connectors, the client sends a small, fixed set of read-only queries rather
than exposing a generic query interface — this keeps query complexity bounded
and avoids any risk of a caller constructing a mutation.

---

## Read-only-first policy

All v0.11.0 Linear connector tools are read-only.

No tool in this connector creates, updates, deletes, comments on, or mutates
any Linear resource (issue, comment, project, cycle, team, or workspace). The
connector sends only GraphQL queries, never mutations — no query string sent
by this connector contains the GraphQL `mutation` keyword.

Write capability requires all five conditions from `docs/mcp-security-policy.md`
before it can be added. None of those conditions are met in v0.11.0.

---

## Supported Linear surfaces

| Surface | Supported in v0.11.0 |
| --- | --- |
| Workspace (organization) identity | Yes |
| Teams (list) | Yes |
| Projects in a team (list) | Yes |
| Issues in a configured team (list, bounded) | Yes |
| Single issue detail (get by identifier, e.g. `ENG-123`) | Yes |
| Issue state, assignee, priority, estimate, labels | Yes |
| Project status summary (issue counts, state breakdown) | Yes |

---

## Unsupported Linear surfaces

| Surface | Why not in v0.11.0 |
| --- | --- |
| Cycles (sprints) | Deferred — team structure varies too much for a reliable v0.11.0 default; cycle ID is documented as a reserved future env var |
| Comments (fetched by default) | Not fetched by default — reduces token cost |
| Linear Roadmap | Out of scope per connector roadmap |
| Linear Documents | Out of scope per connector roadmap |
| Attachments | Out of scope — no attachment access of any kind |
| Sub-issue trees / full relation graphs | Not resolved — related issues are listed by identifier only, not expanded |
| Webhooks | Out of scope — no background polling or receivers |
| Workspace / billing management | Out of scope |
| Write operations of any kind | Hard boundary — not in v0.11.0 |

---

## Required configuration

```txt
OH_MY_PM_LINEAR_TOKEN=<api-key>          # required — no useful read without it
OH_MY_PM_LINEAR_TEAM_ID=<team-id>        # required — scopes issue/project reads
```

Linear's GraphQL API requires authentication for all useful queries. There is
no unauthenticated/public fallback (same as the ClickUp and Airtable
connectors, unlike the GitHub connector). When the token is missing, the
connector returns an actionable degraded response instead of crashing or
attempting an unauthenticated request.

---

## Optional configuration

```txt
OH_MY_PM_LINEAR_WORKSPACE_ID=<workspace-id>   # narrows workspace-identity tool, informational
OH_MY_PM_LINEAR_PROJECT_ID=<project-id>       # default project for project-scoped tools
OH_MY_PM_LINEAR_API_BASE_URL=<url>            # default: https://api.linear.app/graphql
```

Reserved for future use, documented for planning purposes only — not read by
any v0.11.0 tool:

```txt
OH_MY_PM_LINEAR_CYCLE_ID=<cycle-id>
OH_MY_PM_LINEAR_LABEL_ID=<label-id>
```

Tools that need a project accept it as an explicit input parameter
(`project_id`); when omitted they fall back to `OH_MY_PM_LINEAR_PROJECT_ID`.
Project-scoped tools without any project available return an actionable
`config_missing` error. Team-scoped tools (issue listing) always use
`OH_MY_PM_LINEAR_TEAM_ID`.

---

## Least-privilege token guidance

Use a Linear personal API key or a workspace-scoped app token limited to the
minimum access needed to read the target team:

- Prefer a personal API key with member-level (not admin) workspace access
  when only read access is needed.
- Scope usage to the team(s) actually used with Oh My PM by setting
  `OH_MY_PM_LINEAR_TEAM_ID` rather than iterating over every team in the
  workspace.
- The connector does not need and will never send a GraphQL mutation.

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

This connector does not and will not support write actions in v0.11.0:

```txt
create issue           — not implemented
update issue           — not implemented
delete issue           — not implemented
create comment         — not implemented
update comment         — not implemented
delete comment         — not implemented
change status          — not implemented
change state           — not implemented
change assignee        — not implemented
change priority        — not implemented
change estimate         — not implemented
change cycle            — not implemented
change label            — not implemented
create project          — not implemented
update project          — not implemented
delete project          — not implemented
create team              — not implemented
update team              — not implemented
delete team              — not implemented
create webhook           — not implemented
update webhook           — not implemented
delete webhook            — not implemented
```

Any future write action requires separate policy documentation and review per
`docs/mcp-security-policy.md`.

---

## Failure / degraded behavior

| Failure | Connector behavior |
| --- | --- |
| Token missing | Returns `status: "degraded"`, `error_code: "auth_required"`, actionable message |
| Team ID missing | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| Project missing (project-scoped tool, no default configured) | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| GraphQL `errors` array present (e.g. bad field, unauthenticated) | Returns `status: "error"`, `error_code: "api_error"` or `auth_failed` depending on message content — never exposes token |
| HTTP 401 | Returns `status: "error"`, `error_code: "auth_failed"` — does not expose token |
| HTTP 403 | Returns `status: "error"`, `error_code: "permission_denied"` |
| HTTP 404 (team/issue not found) | Returns `status: "error"`, `error_code: "resource_not_found"` |
| HTTP 429 | Returns `status: "error"`, `error_code: "rate_limited"`, includes retry hint |
| Network error | Returns `status: "error"`, `error_code: "network_error"`, safe message |
| Unexpected API error | Returns `status: "error"`, `error_code: "api_error"`, safe message only |

The MCP server never crashes on connector error. The agent continues without
Linear data and informs the user.

---

## Rate-limit behavior

- The connector reads `x-ratelimit-requests-remaining` from Linear API
  responses when present.
- If remaining requests fall below 10, the tool response includes a
  `rate_limit_warning` field.
- If rate limited (429), the tool returns a structured error with a retry
  hint.
- No retry loop — the connector returns the error immediately for the agent
  to handle.

---

## Pagination and item limits

- Default max items per list tool: 25
- Hard max items per list tool: 100 (enforced regardless of user request)
- Linear GraphQL connection pagination (`first`, cursor-based) is handled
  internally — the connector requests only up to the bounded limit per call,
  it does not walk multiple pages
- Long issue descriptions are truncated to 500 characters with a truncation
  note
- Comments and full sub-issue trees are not fetched by default

---

## Tool list

| Tool name | Description |
| --- | --- |
| `linear_list_issues` | List open issues in the configured team, with delivery tags (blocked, stale, unassigned, missing estimate, missing cycle) |
| `linear_summarize_issue` | Get a structured summary of a single issue by identifier |
| `linear_summarize_project_status` | Summarize the delivery status of a project: issue counts, state breakdown, blockers, stale issues, next-action candidates |
| `linear_list_teams` | List teams in the configured workspace |
| `linear_list_projects` | List projects in the configured team |

---

## Resource list

| Resource URI | Description |
| --- | --- |
| `linear://workspace/current` | Current configured workspace identity |
| `linear://teams` | Teams accessible to the configured token (bounded) |
| `linear://issues/open` | Open issues in the configured team (bounded) |

If the MCP SDK resource registration requires a distinct URI shape, the
literal URIs above are used as-is — the SDK accepts custom scheme URIs the
same way the `project://`, `github://`, `clickup://`, and `airtable://`
resources are already registered.

---

## Prompts

| Prompt | Description |
| --- | --- |
| `summarize-linear-delivery-status` | Delivery status using Linear issue/project data |
| `diagnose-linear-issue-backlog` | Issue backlog diagnosis using delivery semantics (blocked, stale, unassigned, missing estimate) |
| `prepare-linear-project-handoff` | Handoff prompt seeded with current Linear issue/project context |

---

## Delivery semantics

The connector translates Linear team/project/issue data into
delivery-management language. Where data allows, it identifies:

```txt
open work               — issues whose state type is not "completed" or "canceled"
stale work              — issues with no update in >14 days
blocked work            — issues whose state name matches a blocked pattern, or with a "blocked" label
unassigned work         — issues with no assignee
missing estimates       — issues with no point estimate set
missing cycles          — issues not assigned to any cycle
overdue project risk    — not computed in v0.11.0 (project target dates are read but not compared against issue completion rate)
unclear states          — issue states that do not map to a known Linear state type (backlog/unstarted/started/completed/canceled)
missing priorities      — issues with priority "No priority"
dependency risk         — not computed in v0.11.0 (Linear issue relations are not read)
handoff gaps            — unassigned + missing-estimate issues combined
next-action candidates  — oldest stale or unassigned open issues
```

Dependency risk is explicitly not computed in v0.11.0 — the connector does
not read Linear issue relations (blocks/blocked-by/related). This is stated
in tool output `limitations` fields rather than silently omitted.

The connector does not overpromise analysis when data is unavailable — every
tool response includes `assumptions` and, where relevant, `limitations`
fields.

---

## Test approach

All tests use mocked HTTP responses. No real Linear API calls in tests.

Tests cover:

- Config loading (valid, missing token, missing team ID, custom base URL)
- Each tool with a mocked success response
- Each tool with missing token (degraded response)
- Each tool with missing team/project config (actionable error)
- Each tool with GraphQL error / 401/403/404/429 responses
- Pagination limit enforcement
- Issue description truncation
- Token redaction from error output
- Read-only policy (no write tool names exist, Linear tool descriptions do
  not promise writes, no query sent by the connector contains the string
  `mutation`)
- Delivery tag extraction (blocked, stale, unassigned, missing estimate,
  missing cycle)

---

## Future write-capability policy

Write capability for the Linear connector is explicitly out of scope in
v0.11.0.

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
- `packages/mcp-server/README.md`
