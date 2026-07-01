# Airtable Connector

This document defines the Phase 10 scope for the Oh My PM Airtable connector.

No write actions are implemented. This connector is read-only.

---

## Purpose

Give the Oh My PM MCP server access to live Airtable base, table, and record
data for delivery diagnosis, operational data review, source-of-truth review,
handoff generation, and delivery status summarization.

The connector reads from a configured Airtable base and table using the
Airtable REST API (v0, `api.airtable.com`). It translates raw record data
into delivery-management language: missing required fields, empty owner
fields, stale records, inconsistent statuses, unlinked records, and handoff
gaps.

Airtable's schema is user-defined and varies significantly between teams —
unlike GitHub or ClickUp, there is no fixed "status"/"assignee" field. The
connector reads whichever fields exist and reports on data-quality signal
using field names present in the record, rather than assuming a fixed schema.

---

## Read-only-first policy

All v0.10.0 Airtable connector tools are read-only.

No tool in this connector creates, updates, deletes, or uploads any Airtable
resource (base, table, field, record, view, or attachment).

Write capability requires all five conditions from `docs/mcp-security-policy.md`
before it can be added. None of those conditions are met in v0.10.0.

---

## Supported Airtable surfaces

| Surface | Supported in v0.10.0 |
| --- | --- |
| Base identity (configured base) | Yes |
| Tables in a base (list, via base schema endpoint) | Yes |
| Table schema — field names and types (describe) | Yes |
| Records in a table (list, bounded) | Yes |
| Single record detail (get by ID) | Yes |
| Views (list, names only) | Yes |

---

## Unsupported Airtable surfaces

| Surface | Why not in v0.10.0 |
| --- | --- |
| Attachments (download/upload) | Out of scope — no attachment access of any kind |
| Airtable automations | Out of scope |
| Airtable interfaces / dashboards | Out of scope |
| Multi-base joins / linked-record resolution across bases | Out of scope — v0.10.0 reads one configured base/table at a time |
| Comments on records | Not fetched by default — reduces token cost |
| Full cell values for long text / attachment fields | Not fetched in full — truncated or summarized |
| Webhooks | Out of scope — no background polling or receivers |
| Billing / workspace management | Out of scope |
| Write operations of any kind | Hard boundary — not in v0.10.0 |

---

## Required configuration

```txt
OH_MY_PM_AIRTABLE_TOKEN=<personal-access-token>   # required — no useful read without it
OH_MY_PM_AIRTABLE_BASE_ID=<base-id>                # required — scopes all reads
```

At least one of `OH_MY_PM_AIRTABLE_TABLE_ID` or `OH_MY_PM_AIRTABLE_TABLE_NAME`
is required for table/record-scoped tools. Base-only tools (`airtable_list_bases`,
`airtable_list_tables`) work with only the token and base ID configured.

Airtable's API requires authentication for all useful endpoints. There is no
unauthenticated/public fallback (same as the ClickUp connector, unlike the
GitHub connector). When the token is missing, the connector returns an
actionable degraded response instead of crashing or attempting an
unauthenticated request.

---

## Optional configuration

```txt
OH_MY_PM_AIRTABLE_TABLE_ID=<table-id>              # default table for table/record-scoped tools
OH_MY_PM_AIRTABLE_TABLE_NAME=<table-name>          # alternative to table ID, used if ID not set
OH_MY_PM_AIRTABLE_API_BASE_URL=<url>               # default: https://api.airtable.com/v0
```

Reserved for future use, documented for planning purposes only — not read by
any v0.10.0 tool:

```txt
OH_MY_PM_AIRTABLE_VIEW_ID=<view-id>
OH_MY_PM_AIRTABLE_VIEW_NAME=<view-name>
```

Tools that need a table accept it as an explicit input parameter (`table_id`
or `table_name`); when omitted they fall back to `OH_MY_PM_AIRTABLE_TABLE_ID`
then `OH_MY_PM_AIRTABLE_TABLE_NAME`. If none is available, the tool returns
an actionable `config_missing` error.

---

## Least-privilege token guidance

Use an Airtable personal access token scoped to the minimum access needed to
read the target base:

- Scope the token to `data.records:read` and `schema.bases:read` only — do
  not grant `data.records:write`, `schema.bases:write`, or any other
  write-capable scope.
- Scope the token to the specific base(s) actually used with Oh My PM, not
  every base in the workspace.
- The connector does not need and will never use any write-capable Airtable
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

This connector does not and will not support write actions in v0.10.0:

```txt
create record          — not implemented
update record          — not implemented
delete record          — not implemented
create table           — not implemented
update table           — not implemented
delete table           — not implemented
create field           — not implemented
update field           — not implemented
delete field           — not implemented
create base            — not implemented
update base            — not implemented
delete base            — not implemented
upload attachment      — not implemented
create webhook         — not implemented
update webhook         — not implemented
delete webhook         — not implemented
```

Any future write action requires separate policy documentation and review per
`docs/mcp-security-policy.md`.

---

## Failure / degraded behavior

| Failure | Connector behavior |
| --- | --- |
| Token missing | Returns `status: "degraded"`, `error_code: "auth_required"`, actionable message |
| Base ID missing | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| Table missing (table/record-scoped tool, no default configured) | Returns `status: "error"`, `error_code: "config_missing"`, actionable message |
| 401 Unauthorized | Returns `status: "error"`, `error_code: "auth_failed"` — does not expose token |
| 403 Forbidden | Returns `status: "error"`, `error_code: "permission_denied"` |
| 404 Not Found | Returns `status: "error"`, `error_code: "resource_not_found"` |
| 422 Unprocessable (bad field/view name) | Returns `status: "error"`, `error_code: "invalid_request"` |
| 429 Rate Limited | Returns `status: "error"`, `error_code: "rate_limited"`, includes retry hint |
| Network error | Returns `status: "error"`, `error_code: "network_error"`, safe message |
| Unexpected API error | Returns `status: "error"`, `error_code: "api_error"`, safe message only |

The MCP server never crashes on connector error. The agent continues without
Airtable data and informs the user.

---

## Rate-limit behavior

- Airtable does not return standard `x-ratelimit-*` headers on success; the
  connector detects rate limiting only via HTTP 429 responses.
- On 429, the tool returns a structured `rate_limited` error with a retry
  hint (Airtable's documented limit is 5 requests/second per base).
- No retry loop — the connector returns the error immediately for the agent
  to handle.

---

## Pagination and item limits

- Default max records per list tool: 25
- Hard max records per list tool: 100 (enforced regardless of user request)
- Airtable record list pagination (`offset` cursor) is handled internally —
  the connector fetches pages until the limit is met or the API reports no
  further pages
- Long text field values are truncated to 500 characters with a truncation
  note
- Attachment fields are summarized as a count and file names only, never
  downloaded
- Comments are not fetched by default

---

## Tool list

| Tool name | Description |
| --- | --- |
| `airtable_list_bases` | List bases accessible to the configured token |
| `airtable_list_tables` | List tables in the configured base, with field counts |
| `airtable_describe_table` | Describe a table's schema: field names, types, and options |
| `airtable_list_records` | List records in a configured or specified table, with data-quality tags (missing required fields, empty owner, stale, unclear status) |
| `airtable_summarize_base_status` | Summarize delivery status of a table: record count, data-quality issues, stale records, missing owners, next-action candidates |

---

## Resource list

| Resource URI | Description |
| --- | --- |
| `airtable://base/current` | Current configured base identity |
| `airtable://tables` | Tables in the configured base (bounded) |
| `airtable://records/current` | Records in the configured table (bounded) |

If the MCP SDK resource registration requires a distinct URI shape, the
literal URIs above are used as-is — the SDK accepts custom scheme URIs the
same way the `project://`, `github://`, and `clickup://` resources are
already registered.

---

## Prompts

| Prompt | Description |
| --- | --- |
| `summarize-airtable-base-status` | Delivery status using Airtable table/record data |
| `diagnose-airtable-data-quality` | Data-quality diagnosis using delivery semantics (missing fields, stale records, unclear statuses) |
| `prepare-airtable-project-handoff` | Handoff prompt seeded with current Airtable table/record context |

---

## Delivery semantics

The connector translates Airtable base/table/record/schema data into
delivery-management language. Where data allows, it identifies:

```txt
source-of-truth ambiguity   — not computed in v0.10.0 (single-base, single-table scope only)
missing required fields     — records missing a field the tool is configured to treat as required
empty owner fields          — records where a recognized owner-like field (Owner, Assignee, Assigned To) is empty
stale records                — records with no modification in >14 days, when a last-modified field is present
inconsistent statuses        — status-like field values that do not match a small closed/open vocabulary
unclear dependencies          — not computed in v0.10.0 (linked-record fields are listed, not resolved)
unlinked records              — records where a linked-record field is empty
record count risk             — table approaching or exceeding the bounded read limit
data quality risk             — combined signal from missing fields, empty owners, unclear statuses
handoff gaps                  — missing owner + missing due/status combined
next-action candidates        — oldest stale or data-quality-flagged records
```

Source-of-truth ambiguity and cross-base dependency resolution are explicitly
not computed in v0.10.0 — the connector reads one configured base and table
at a time and does not resolve linked-record references across bases. This
is stated in tool output `limitations` fields rather than silently omitted.

Because Airtable schemas are user-defined, "owner," "status," and "due date"
detection is heuristic — the connector matches common field name patterns
(for example `/owner|assignee|assigned/i`, `/status|state/i`,
`/due|deadline/i`) rather than assuming a fixed schema. This heuristic is
stated in `assumptions` on every relevant tool response.

The connector does not overpromise analysis when data is unavailable — every
tool response includes `assumptions` and, where relevant, `limitations`
fields.

---

## Test approach

All tests use mocked HTTP responses. No real Airtable API calls in tests.

Tests cover:

- Config loading (valid, missing token, missing base ID, missing table, custom base URL)
- Each tool with a mocked success response
- Each tool with missing token (degraded response)
- Each tool with missing base/table config (actionable error)
- Each tool with 401/403/404/422/429 error responses
- Pagination limit enforcement
- Long field value truncation
- Token redaction from error output
- Read-only policy (no write tool names exist, Airtable tool descriptions do
  not promise writes)
- Data-quality tag extraction (missing required field, empty owner, stale,
  unclear status)

---

## Future write-capability policy

Write capability for the Airtable connector is explicitly out of scope in
v0.10.0.

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
- `packages/mcp-server/README.md`
