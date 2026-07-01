# ClickUp Connector

This document defines the Phase 9 scope for the Oh My PM ClickUp connector.

No write actions are implemented. This connector is read-only.

---

## Purpose

Give the Oh My PM MCP server access to live ClickUp workspace, space, folder,
list, and task data for delivery diagnosis, backlog review, risk review,
handoff generation, and delivery status summarization.

The connector reads from a configured ClickUp workspace using the ClickUp
REST API (v2). It translates raw task/list data into delivery-management
language: open work, stale work, blocked work, unassigned work, missing due
dates, overdue work, unclear statuses, and handoff gaps.

---

## Read-only-first policy

All v0.9.0 ClickUp connector tools are read-only.

No tool in this connector creates, updates, moves, comments on, tags, assigns,
or deletes any ClickUp resource (task, list, folder, space, or workspace).

Write capability requires all five conditions from `docs/mcp-security-policy.md`
before it can be added. None of those conditions are met in v0.9.0.

---

## Supported ClickUp surfaces

| Surface | Supported in v0.9.0 |
| --- | --- |
| Workspace (team) identity | Yes |
| Spaces (list) | Yes |
| Folders (list) | Yes |
| Lists (list) | Yes |
| Tasks in a list (list, bounded) | Yes |
| Single task detail (get by ID) | Yes |
| Task status, assignees, priority, due date | Yes |

---

## Unsupported ClickUp surfaces

| Surface | Why not in v0.9.0 |
| --- | --- |
| ClickUp Docs | Out of scope — not delivery task data |
| Time tracking | Out of scope per connector roadmap |
| Comments (fetched by default) | Not fetched by default — reduces token cost; may be added as an explicit opt-in later |
| Custom fields (fetched by default) | Not fetched by default — reduces token cost |
| Billing / workspace management | Out of scope |
| Goals / dashboards | Out of scope |
| Webhooks | Out of scope — no background polling or receivers |
| Chat / chat channels | Out of scope |
| Write operations of any kind | Hard boundary — not in v0.9.0 |

---

## Required configuration

```txt
OH_MY_PM_CLICKUP_TOKEN=<api-token>          # required — no useful read without it
OH_MY_PM_CLICKUP_WORKSPACE_ID=<workspace-id>  # required — scopes all reads
```

ClickUp's API requires authentication for all useful endpoints. There is no
unauthenticated/public fallback (unlike the GitHub connector). When the token
is missing, the connector returns an actionable degraded response instead of
crashing or attempting an unauthenticated request.

---

## Optional configuration

```txt
OH_MY_PM_CLICKUP_SPACE_ID=<space-id>          # narrows space-scoped tools
OH_MY_PM_CLICKUP_FOLDER_ID=<folder-id>        # narrows folder-scoped tools
OH_MY_PM_CLICKUP_LIST_ID=<list-id>            # default list for task tools
OH_MY_PM_CLICKUP_API_BASE_URL=<url>           # default: https://api.clickup.com/api/v2
```

Tools that need a list ID accept it as an explicit input parameter; when the
parameter is omitted they fall back to `OH_MY_PM_CLICKUP_LIST_ID`. If neither
is available, the tool returns an actionable `config_missing` error.

---

## Least-privilege token guidance

Use a ClickUp API token scoped to the minimum access needed to read tasks in
the target workspace:

- Prefer a personal API token limited to the workspace(s) actually used with
  Oh My PM.
- Do not use a token belonging to a workspace owner/admin account if a
  member-level token with read access is sufficient.
- The connector does not need and will never use any write-capable ClickUp
  API endpoint.

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

This connector does not and will not support write actions in v0.9.0:

```txt
create task            — not implemented
update task            — not implemented
delete task            — not implemented
create comment         — not implemented
update comment         — not implemented
change status          — not implemented
change assignee        — not implemented
change priority        — not implemented
change due date         — not implemented
change custom field    — not implemented
create list            — not implemented
update list            — not implemented
delete list            — not implemented
create folder          — not implemented
update folder          — not implemented
delete folder          — not implemented
create space           — not implemented
update space           — not implemented
delete space           — not implemented
create workspace        — not implemented
update workspace        — not implemented
```

Any future write action requires separate policy documentation and review per
`docs/mcp-security-policy.md`.

---

## Failure / degraded behavior

| Failure | Connector behavior |
| --- | --- |
| Token missing | Returns `status: "degraded"`, `error_code: "auth_required"`, actionable message |
| Workspace ID missing | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| List ID missing (list-scoped tool, no default configured) | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| 401 Unauthorized | Returns `status: "error"`, `error_code: "auth_failed"` — does not expose token |
| 403 Forbidden | Returns `status: "error"`, `error_code: "permission_denied"` |
| 404 Not Found | Returns `status: "error"`, `error_code: "resource_not_found"` |
| 429 Rate Limited | Returns `status: "error"`, `error_code: "rate_limited"`, includes retry hint |
| Network error | Returns `status: "error"`, `error_code: "network_error"`, safe message |
| Unexpected API error | Returns `status: "error"`, `error_code: "api_error"`, safe message only |

The MCP server never crashes on connector error. The agent continues without
ClickUp data and informs the user.

---

## Rate-limit behavior

- The connector reads `x-ratelimit-remaining` from ClickUp API responses when
  present.
- If remaining requests fall below 10, the tool response includes a
  `rate_limit_warning` field.
- If rate limited (429 or `x-ratelimit-remaining: 0`), the tool returns a
  structured error with a retry hint.
- No retry loop — the connector returns the error immediately for the agent
  to handle.

---

## Pagination and item limits

- Default max items per list tool: 25
- Hard max items per list tool: 100 (enforced regardless of user request)
- ClickUp task list pagination is handled internally — the connector fetches
  pages until the limit is met or the API reports no further pages
- Long task descriptions are truncated to 500 characters with a truncation
  note
- Comments and full custom field values are not fetched by default

---

## Tool list

| Tool name | Description |
| --- | --- |
| `clickup_list_tasks` | List open tasks in a configured or specified list, with delivery tags (stale, unassigned, missing due date, overdue) |
| `clickup_summarize_task` | Get a structured summary of a single task by ID |
| `clickup_summarize_list_status` | Summarize the delivery status of a list: open/closed counts, stale, blocked, unassigned, overdue |
| `clickup_list_spaces` | List spaces in the configured workspace |
| `clickup_list_folders` | List folders in a configured or specified space |
| `clickup_list_lists` | List lists in a configured or specified folder or space |
| `clickup_get_workspace_context` | Get workspace identity: name, ID, space count |

---

## Resource list

| Resource URI | Description |
| --- | --- |
| `clickup://workspace/current` | Current configured workspace identity |
| `clickup://spaces` | Spaces in the configured workspace (bounded) |
| `clickup://lists` | Lists in the configured space/folder (bounded) |
| `clickup://tasks/open` | Open tasks in the configured list (bounded) |

If the MCP SDK resource registration requires a distinct URI shape, the
literal URIs above are used as-is — the SDK accepts custom scheme URIs the
same way the `project://` and `github://` resources are already registered.

---

## Prompts

| Prompt | Description |
| --- | --- |
| `summarize-clickup-delivery-status` | Delivery status using ClickUp list/task data |
| `diagnose-clickup-task-backlog` | Task backlog diagnosis using delivery semantics (stale, blocked, unassigned) |
| `prepare-clickup-project-handoff` | Handoff prompt seeded with current ClickUp task/list context |

---

## Delivery semantics

The connector translates ClickUp task/list/workspace data into
delivery-management language. Where data allows, it identifies:

```txt
open work              — tasks not in a closed/complete status
stale work             — tasks with no update in >14 days
blocked work           — tasks with a status name matching blocked/blocker patterns
unassigned work        — tasks with no assignees
missing due dates      — tasks with no due date set
overdue work           — tasks with a due date in the past and not closed
unclear statuses       — tasks whose status does not map to a known open/closed bucket
dependency risk         — not computed in v0.9.0 (ClickUp dependency API not read)
handoff gaps            — unassigned + missing-due-date tasks combined
next-action candidates  — oldest stale or overdue open tasks
```

Dependency risk is explicitly not computed in v0.9.0 — the connector does not
read the ClickUp task dependency endpoint. This is stated in tool output
`limitations` fields rather than silently omitted.

The connector does not overpromise analysis when data is unavailable — every
tool response includes `assumptions` and, where relevant, `limitations`
fields.

---

## Test approach

All tests use mocked HTTP responses. No real ClickUp API calls in tests.

Tests cover:

- Config loading (valid, missing token, missing workspace ID, custom base URL)
- Each tool with a mocked success response
- Each tool with missing token (degraded response)
- Each tool with missing workspace/list config (actionable error)
- Each tool with 401/403/404/429 error responses
- Pagination limit enforcement
- Task description truncation
- Token redaction from error output
- Read-only policy (no write tool names exist, ClickUp tool descriptions do
  not promise writes)
- Delivery tag extraction (stale, unassigned, missing due date, overdue)

---

## Future write-capability policy

Write capability for the ClickUp connector is explicitly out of scope in
v0.9.0.

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
- `packages/mcp-server/README.md`
