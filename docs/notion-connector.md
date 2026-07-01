# Notion Connector

This document defines the Phase 13 scope for the Oh My PM Notion connector.

No write actions are implemented. This connector is read-only.

---

## Purpose

Give the Oh My PM MCP server access to live Notion page, database, and block
data for delivery diagnosis, knowledge-base review, operational
documentation review, source-of-truth review, handoff generation, and
delivery status summarization.

The connector reads from a Notion workspace that has an integration
installed, using the Notion REST API (`api.notion.com/v1`). It translates
raw page/database data into delivery-management language: stale
documentation, missing owners, missing status fields, missing due dates,
unclear next actions, unlinked pages, and handoff gaps.

**Important API note:** Notion's `search` and `database query` endpoints are
`POST` requests even though they perform no mutation — the request body
carries filter/sort parameters, not a payload to write. This connector calls
only these read endpoints (`GET /pages/{id}`, `GET /databases/{id}`,
`GET /blocks/{id}/children`, `POST /search`, `POST /databases/{id}/query`)
and never calls a page/block/database create, update, append, or delete
endpoint. The distinction is documented explicitly here and in the
read-only policy tests, since HTTP method alone is not a reliable read/write
signal for this API.

---

## Read-only-first policy

All v0.13.0 Notion connector tools are read-only.

No tool in this connector creates, updates, deletes, or archives any Notion
resource (page, database, block, comment, or property). No tool appends
block children, even though Notion's own API considers block append the only
way to "edit" most page content — this connector never calls that endpoint.

Write capability requires all five conditions from `docs/mcp-security-policy.md`
before it can be added. None of those conditions are met in v0.13.0.

---

## Supported Notion surfaces

| Surface | Supported in v0.13.0 |
| --- | --- |
| Page metadata and property values (get by ID) | Yes |
| Page content — top-level block children as plain text (bounded) | Yes |
| Database schema — property names and types (describe) | Yes |
| Database items (query, bounded, optional status filter) | Yes |
| Workspace-wide search for pages/databases (bounded) | Yes |

---

## Unsupported Notion surfaces

| Surface | Why not in v0.13.0 |
| --- | --- |
| Nested block children beyond the first level | Not resolved — reduces token cost and avoids unbounded recursive fetches |
| Comments (fetched by default) | Not fetched by default — reduces token cost |
| Rich text formatting / annotations | Only plain text content is extracted — formatting metadata is dropped |
| File/media blocks | Out of scope — no attachment access of any kind |
| Notion wiki or documentation page creation | Out of scope per connector roadmap |
| Block-level editing (including block append) | Out of scope per connector roadmap — hard boundary |
| Workspace-level access beyond the configured page/database | Out of scope per connector roadmap |
| Sharing / permission inspection | Out of scope |
| Webhooks | Out of scope — no background polling or receivers |
| Write operations of any kind | Hard boundary — not in v0.13.0 |

---

## Required configuration

```txt
OH_MY_PM_NOTION_TOKEN=<integration-token>   # required — no useful read without it
```

At least one of `OH_MY_PM_NOTION_PAGE_ID` or `OH_MY_PM_NOTION_DATABASE_ID` is
required for page/database-scoped tools. Workspace-search tools
(`notion_search_pages`) work with only the token configured.

Notion's API requires authentication for all useful endpoints. There is no
unauthenticated/public fallback (same as the ClickUp, Airtable, Linear, and
Jira connectors, unlike the GitHub connector). When the token is missing,
the connector returns an actionable degraded response instead of crashing or
attempting an unauthenticated request.

The Notion integration corresponding to the token must be explicitly shared
with (added to) the target page/database by a workspace member before use —
this is a manual, out-of-band step the connector cannot automate or detect
in advance; a 404 on an otherwise-valid ID usually means the integration
has not been shared with that page or database.

---

## Optional configuration

```txt
OH_MY_PM_NOTION_PAGE_ID=<page-id>            # default page for page-scoped tools
OH_MY_PM_NOTION_DATABASE_ID=<database-id>    # default database for database-scoped tools
OH_MY_PM_NOTION_API_BASE_URL=<url>           # default: https://api.notion.com/v1
```

Reserved for future use, documented for planning purposes only — not read by
any v0.13.0 tool:

```txt
OH_MY_PM_NOTION_WORKSPACE_ID=<workspace-id>
OH_MY_PM_NOTION_TEAMSPACE_ID=<teamspace-id>
```

Tools that need a page or database accept it as an explicit input parameter
(`page_id` / `database_id`); when omitted they fall back to
`OH_MY_PM_NOTION_PAGE_ID` / `OH_MY_PM_NOTION_DATABASE_ID`. If neither is
available, the tool returns an actionable `config_missing` error.

---

## Least-privilege token guidance

Use a Notion internal integration token scoped to the minimum access needed:

- Create a dedicated internal integration for Oh My PM rather than reusing
  an integration with broader capabilities.
- In the integration's capabilities settings, grant only "Read content" —
  do not grant "Insert content," "Update content," or "No user information"
  exceptions beyond what is required.
- Share the integration with only the specific page(s)/database(s) actually
  used with Oh My PM, not the entire workspace.
- The connector does not need and will never call a Notion write-capable
  endpoint (create/update/append/delete/archive).

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

This connector does not and will not support write actions in v0.13.0:

```txt
create page          — not implemented
update page          — not implemented
delete page          — not implemented
archive page         — not implemented
create database      — not implemented
update database      — not implemented
delete database      — not implemented
create block         — not implemented
append block         — not implemented
update block         — not implemented
delete block         — not implemented
create comment       — not implemented
update comment       — not implemented
delete comment       — not implemented
share page           — not implemented
update permission    — not implemented
create integration   — not implemented
update integration   — not implemented
```

Any future write action requires separate policy documentation and review per
`docs/mcp-security-policy.md`.

---

## Failure / degraded behavior

| Failure | Connector behavior |
| --- | --- |
| Token missing | Returns `status: "degraded"`, `error_code: "auth_required"`, actionable message |
| Page/database ID missing (page/database-scoped tool, no default configured) | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| HTTP 401 | Returns `status: "error"`, `error_code: "auth_failed"` — does not expose token |
| HTTP 403 | Returns `status: "error"`, `error_code: "permission_denied"` |
| HTTP 404 (page/database not found or integration not shared) | Returns `status: "error"`, `error_code: "resource_not_found"`, message hints at checking integration sharing |
| HTTP 429 | Returns `status: "error"`, `error_code: "rate_limited"`, includes retry hint |
| Network error | Returns `status: "error"`, `error_code: "network_error"`, safe message |
| Unexpected API error | Returns `status: "error"`, `error_code: "api_error"`, safe message only |

The MCP server never crashes on connector error. The agent continues without
Notion data and informs the user.

---

## Rate-limit behavior

- Notion documents an average rate limit of about 3 requests/second per
  integration; the connector does not proactively throttle but surfaces 429
  responses as a structured error.
- The connector reads `retry-after` from Notion API responses when present
  and includes it in the `rate_limit_hint`.
- No retry loop — the connector returns the error immediately for the agent
  to handle.

---

## Pagination and item limits

- Default max items per list tool: 25
- Hard max items per list tool: 100 (enforced regardless of user request)
- Notion cursor-based pagination (`start_cursor`/`has_more`) is handled
  internally — the connector requests only up to the bounded limit per call,
  it does not walk multiple pages
- Long rich-text / block content values are truncated to 500 characters with
  a truncation note
- Only the first level of block children is fetched — nested children are
  not recursively expanded
- Comments are not fetched by default

---

## Tool list

| Tool name | Description |
| --- | --- |
| `notion_search_pages` | Search the workspace for pages/databases accessible to the integration, bounded |
| `notion_summarize_page` | Get a structured summary of a single page: properties, top-level content excerpt |
| `notion_query_database` | List items in a configured or specified database, with data-quality tags (missing owner, missing status, missing due date, stale), optional status filter |
| `notion_summarize_database` | Summarize delivery status of a database: item count, data-quality issues, stale items, next-action candidates |
| `notion_get_page_context` | Get a page's properties plus its first-level block children as plain-text content, bounded |

---

## Resource list

| Resource URI | Description |
| --- | --- |
| `notion://workspace/current` | Current configured integration identity (bounded metadata only) |
| `notion://pages/current` | Current configured page's properties and content excerpt (bounded) |
| `notion://database/current` | Current configured database's items (bounded) |

If the MCP SDK resource registration requires a distinct URI shape, the
literal URIs above are used as-is — the SDK accepts custom scheme URIs the
same way the `project://`, `github://`, `clickup://`, `airtable://`,
`linear://`, and `jira://` resources are already registered.

---

## Prompts

| Prompt | Description |
| --- | --- |
| `summarize-notion-delivery-status` | Delivery status using Notion database/page data |
| `diagnose-notion-knowledge-base` | Knowledge-base diagnosis using delivery semantics (stale pages, missing owners, data-quality gaps) |
| `prepare-notion-project-handoff` | Handoff prompt seeded with current Notion page/database context |

---

## Delivery semantics

The connector translates Notion page/database/block data into
delivery-management language. Where data allows, it identifies:

```txt
source-of-truth ambiguity   — not computed in v0.13.0 (single configured page/database scope only)
stale documentation         — pages/items with no edit signal in >14 days, when a last-edited timestamp is present
missing owners              — database items where a recognized owner-like property (Owner, Assignee, Person) is empty
missing status fields       — database items where a recognized status-like property is empty or absent
missing due dates           — database items where a recognized due-date-like property is empty
unclear next actions        — not computed in v0.13.0 (requires reading full page content, out of scope for token efficiency)
unlinked or orphaned pages  — not computed in v0.13.0 (relation/backlink resolution is not read)
database property gaps      — properties present in the schema but empty across most sampled items
handoff gaps                — missing owner + missing due-date items combined
data quality risk           — combined signal from missing owners, missing status, missing due dates
knowledge-base risk         — combined signal from stale pages and database property gaps
next-action candidates      — oldest stale or data-quality-flagged items
```

Because Notion database schemas are user-defined, "owner," "status," and
"due date" detection is heuristic — the connector matches common property
name patterns (for example `/owner|assignee|person/i`, `/status|state/i`,
`/due|deadline/i`) rather than assuming a fixed schema, the same approach
used for the Airtable connector. This heuristic is stated in `assumptions`
on every relevant tool response.

Source-of-truth ambiguity, unclear next actions, and relation/backlink
resolution are explicitly not computed in v0.13.0. This is stated in tool
output `limitations` fields rather than silently omitted.

The connector does not overpromise analysis when data is unavailable — every
tool response includes `assumptions` and, where relevant, `limitations`
fields.

---

## Test approach

All tests use mocked HTTP responses. No real Notion API calls in tests.

Tests cover:

- Config loading (valid, missing token, missing page ID, missing database
  ID, custom base URL)
- Each tool with a mocked success response
- Each tool with missing token (degraded response)
- Each tool with missing page/database config (actionable error)
- Each tool with 401/403/404/429 error responses
- Pagination limit enforcement
- Rich-text / block content truncation
- Token redaction from error output
- Read-only policy (no write tool names exist, Notion tool descriptions do
  not promise writes, no `create`/`update`/`append`/`delete`/`archive`
  Notion endpoint path is ever called — only `GET` and the two read-only
  `POST` endpoints, `/search` and `/databases/{id}/query`, are used)
- Data-quality tag extraction (missing owner, missing status, missing due
  date, stale)

---

## Future write-capability policy

Write capability for the Notion connector is explicitly out of scope in
v0.13.0.

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
- `docs/jira-connector.md`
- `packages/mcp-server/README.md`
