# MCP Connector Roadmap

This document defines the sequencing, design, and non-goals for each planned Oh My PM MCP connector.

No connectors are implemented in v0.6.0. This is a planning document.

---

## Connector sequencing

| Version | Connector | Rationale |
| --- | --- | --- |
| v0.7.0 | MCP server alpha — no external connector | Validate server architecture with local context only |
| v0.8.0 | GitHub Issues / Projects | Released — Phase 8 |
| v0.9.0 | ClickUp | Released — Phase 9 |
| **v0.10.0** | Airtable | In progress — Phase 10 |
| v0.11.0 | Linear | Engineering-focused, fast API, increasingly common |
| v0.12.0 | Jira | Enterprise standard, complex API, higher integration cost |
| v0.13.0 | Notion | Docs-as-PM hybrid, high user demand, API has limitations |

One connector per version. Connectors do not ship until their security review is complete.

---

## v0.7.0 — MCP Server Alpha (no external connector)

**Purpose:** Validate the MCP server architecture using only local repository context.

**Read-only first capability:**

- `inspect_project_context` — read AGENTS.md, VERSION, README, CHANGELOG for project identity
- `diagnose_project` — structured project diagnosis from local context
- `prepare_agent_handoff` — generate handoff prompt from available context
- `summarize_delivery_status` — delivery status from local docs

**Write capability:** None. Read-only only.

**Required user configuration:** Project root path.

**Testing approach:** Integration tests against a local synthetic test project. No external API calls in tests.

**Risks:**

- MCP protocol version compatibility with target clients
- Local repo structure assumptions that don't hold for all project types

**Non-goals:**

- No external API calls
- No connector configuration
- No authentication beyond local file read access

---

## v0.8.0 — GitHub Issues / Projects Connector

**Purpose:** Give the agent access to live GitHub issue and milestone data for delivery diagnosis.

**Read-only first capability:**

- List open issues with title, assignee, label, priority
- Get milestone status (open/closed, % complete, target date)
- List items labeled as blockers
- List recent activity (last 7 days of issue events)

**Potential future write capability (not in v0.8.0):**

- Create issues
- Update issue status
- Add labels
- Comment on issues

Each write action requires a separate security review before it is added.

**Required user configuration:**

```txt
OH_MY_PM_GITHUB_TOKEN=<personal-access-token>
OH_MY_PM_GITHUB_REPO=owner/repo
```

Token must be scoped to `repo:read` only. Write scopes are not required or requested.

**Testing approach:** Integration tests against a dedicated synthetic test repository. API responses are mocked in unit tests to avoid rate limit and network dependency.

**Risks:**

- GitHub API rate limits for high-frequency tool calls
- Repository access changes mid-session
- Large repositories with thousands of issues require bounded list responses

**Non-goals:**

- No GitHub Actions integration
- No pull request data (delivery context only)
- No repository code access
- No organization-level data beyond what is needed for the named repository

---

## v0.9.0 — ClickUp Connector (Released — Phase 9)

**Purpose:** Give the agent access to ClickUp workspace, space, folder, list, and task data for delivery diagnosis, backlog review, and prioritization.

**Read-only first capability:**

- List open tasks in a configured or specified list, with delivery tags (blocked, stale, unassigned, missing due date, overdue)
- Summarize a single task by ID
- Summarize list delivery status (blockers, stale, unassigned, missing due dates, overdue, next actions)
- List spaces, folders, and lists in the configured workspace
- Get workspace identity (name, ID, space count)

**Potential future write capability (not in v0.9.0):**

- Update task status
- Assign tasks
- Add comments

**Required user configuration:**

```txt
OH_MY_PM_CLICKUP_TOKEN=<api-token>
OH_MY_PM_CLICKUP_WORKSPACE_ID=<workspace-id>
```

ClickUp requires a token for all useful endpoints — unlike GitHub, there is no
unauthenticated fallback. Missing token returns a degraded response.

**Testing approach:** API responses mocked in unit tests. No real ClickUp API calls in tests.

**Risks:**

- ClickUp API version changes
- Workspace hierarchy (spaces, folders, lists) varies significantly between teams — connector must handle variable structure

**Non-goals:**

- No ClickUp Docs integration
- No time tracking data
- No billing or workspace management
- No comments or custom fields fetched by default
- No dependency-risk computation (dependency endpoint not read)

See `docs/clickup-connector.md` for the full connector scope.

---

## v0.10.0 — Airtable Connector (In progress — Phase 10)

**Purpose:** Give the agent access to Airtable base, table, and record data for delivery diagnosis, operational data review, source-of-truth review, and delivery status summarization.

**Read-only first capability:**

- List bases accessible to the configured token
- List tables in a configured base, with field counts
- Describe a table's schema — field names, types, views
- List records in a configured or specified table, with data-quality tags (missing owner, missing due date, missing required field, stale)
- Summarize table delivery status: record count, data-quality issues, next actions

**Potential future write capability (not in v0.10.0):**

- Update status fields
- Add records

**Required user configuration:**

```txt
OH_MY_PM_AIRTABLE_TOKEN=<personal-access-token>
OH_MY_PM_AIRTABLE_BASE_ID=<base-id>
```

Airtable requires a token for all useful endpoints — unlike GitHub, there is
no unauthenticated fallback. Missing token returns a degraded response.

**Testing approach:** API responses mocked in unit tests. No real Airtable API calls in tests. Airtable's schema-flexible structure requires the connector to use heuristic field-name pattern matching (owner/status/due-date) rather than a fixed schema.

**Risks:**

- Airtable base schemas vary significantly between teams
- Field name assumptions break when users rename columns
- Rate limits on Airtable API free tier

**Non-goals:**

- No Airtable automation integration
- No attachment access
- No multi-base joins
- No linked-record dependency resolution (linked-record fields are listed, not resolved)

See `docs/airtable-connector.md` for the full connector scope.

---

## v0.11.0 — Linear Connector

**Purpose:** Give the agent access to Linear issues and cycle (sprint) data for engineering-focused delivery diagnosis.

**Read-only first capability:**

- List open issues in a configured team
- Get current cycle status
- List issues with blocker or high-urgency labels
- List issues assigned to a named team member

**Potential future write capability (not in v0.11.0):**

- Update issue status
- Assign issues

**Required user configuration:**

```txt
OH_MY_PM_LINEAR_TOKEN=<api-key>
OH_MY_PM_LINEAR_TEAM_ID=<team-id>
```

**Testing approach:** Linear GraphQL API mocked in unit tests. Integration tests against a dedicated synthetic Linear team.

**Risks:**

- Linear uses GraphQL — query complexity limits apply
- Team structure varies (teams, projects, cycles) — connector must handle missing cycles

**Non-goals:**

- No Linear roadmap integration
- No document access

---

## v0.12.0 — Jira Connector

**Purpose:** Give the agent access to Jira issues and sprint data for enterprise delivery contexts.

**Read-only first capability:**

- List open issues in a configured project
- Get sprint status (active sprint, velocity, completion rate)
- List issues with blocker or critical priority
- List issues assigned to a named team member

**Potential future write capability (not in v0.12.0):**

- Update issue status via workflow transitions
- Add comments

**Required user configuration:**

```txt
OH_MY_PM_JIRA_BASE_URL=https://yourorg.atlassian.net
OH_MY_PM_JIRA_EMAIL=user@example.com
OH_MY_PM_JIRA_TOKEN=<api-token>
OH_MY_PM_JIRA_PROJECT_KEY=<project-key>
```

**Testing approach:** Jira REST API mocked in unit tests. Integration tests require a Jira Cloud sandbox account.

**Risks:**

- Jira Cloud vs Jira Data Center API differences
- Custom fields and workflow names vary widely between organizations
- Jira API authentication has changed between versions

**Non-goals:**

- No Jira Confluence integration
- No Jira Service Management integration
- No custom field mapping in v0.12.0

---

## v0.13.0 — Notion Connector

**Purpose:** Give the agent access to Notion-based project pages and task databases for teams using Notion as their PM tool.

**Read-only first capability:**

- List items in a configured database (tasks, projects, milestones)
- Filter by status property
- Get page content for a specific page ID
- List database items assigned to a named team member

**Potential future write capability (not in v0.13.0):**

- Create database items
- Update status properties

**Required user configuration:**

```txt
OH_MY_PM_NOTION_TOKEN=<integration-token>
OH_MY_PM_NOTION_DATABASE_ID=<database-id>
```

The Notion integration must be added to the target workspace by the user before use.

**Testing approach:** Notion API responses mocked in unit tests. Integration tests require a dedicated synthetic Notion workspace.

**Risks:**

- Notion API is append-only for blocks — some update patterns require workarounds
- Database schemas vary by team — field name assumptions break frequently
- Notion API rate limits are stricter than other connectors

**Non-goals:**

- No Notion wiki or documentation page creation
- No block-level editing
- No workspace-level access beyond the configured database

---

## Connector review process

Before any connector ships:

1. Security review: credential handling, scope minimization, no write actions in read-only version
2. API contract review: version stability, rate limits, error handling
3. Test coverage: unit tests with mocked responses, integration tests against synthetic data
4. Documentation: required configuration, testing approach, risks, non-goals
5. Security policy updated: connector added to `docs/mcp-security-policy.md` allowlist

---

## Related docs

- `docs/mcp.md`
- `docs/mcp-interface-design.md`
- `docs/mcp-security-policy.md`
- `ROADMAP.md`
