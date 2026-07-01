# Oh My PM MCP Server

Read-only MCP server for Oh My PM — local context tools, GitHub connector, ClickUp connector, Airtable connector, Linear connector, Jira connector, and Notion connector for delivery agents.

**Version:** v0.13.0  
**Transport:** stdio (local only)  
**Status:** Alpha

---

## What this is

The Oh My PM MCP server gives MCP-compatible clients (Claude Code, Cursor, etc.) structured access to local project context, GitHub Issues/Milestones, ClickUp workspace/list/task data, Airtable base/table/record data, Linear team/project/issue data, Jira project/board/sprint/issue data, and Notion page/database/block data.

All tools are read-only. No write actions. No mutations.

---

## Tools

### Local context tools

| Tool | Description |
| --- | --- |
| `inspect_project_context` | Read project identity from local repo (AGENTS.md, VERSION, README.md) |
| `diagnose_project` | Structured project diagnosis from local context |
| `prepare_agent_handoff` | Self-contained handoff prompt from current context |
| `summarize_delivery_status` | Delivery status from ROADMAP.md and CHANGELOG.md |

### GitHub connector tools (v0.8.0)

| Tool | Description |
| --- | --- |
| `github_list_issues` | List open GitHub issues with delivery tags (blocker, stale), optional label filter |
| `github_summarize_issue` | Structured summary of a single issue by number |
| `github_list_milestones` | Open milestones with due date, completion percentage, overdue flag |
| `github_get_repository_context` | Repository name, description, default branch, open issue count |

GitHub tools require `OH_MY_PM_GITHUB_OWNER` and `OH_MY_PM_GITHUB_REPO` to be set. Without a token, public repositories are accessible at a lower rate limit.

### ClickUp connector tools (v0.9.0)

| Tool | Description |
| --- | --- |
| `clickup_list_tasks` | List open tasks in a list with delivery tags (blocked, stale, unassigned, missing due date, overdue) |
| `clickup_summarize_task` | Structured summary of a single task by ID |
| `clickup_summarize_list_status` | Delivery status summary of a list: blockers, stale, unassigned, overdue, next actions |
| `clickup_list_spaces` | List spaces in the configured workspace |
| `clickup_list_folders` | List folders in a configured or specified space |
| `clickup_list_lists` | List lists in a configured or specified folder or space |
| `clickup_get_workspace_context` | Workspace identity: name, ID, space count |

ClickUp tools require `OH_MY_PM_CLICKUP_WORKSPACE_ID` and `OH_MY_PM_CLICKUP_TOKEN`. Unlike the GitHub connector, ClickUp has no unauthenticated fallback — a missing token returns a degraded response rather than crashing. See `docs/clickup-connector.md`.

### Airtable connector tools (v0.10.0)

| Tool | Description |
| --- | --- |
| `airtable_list_bases` | List bases accessible to the configured token |
| `airtable_list_tables` | List tables in the configured base, with field counts |
| `airtable_describe_table` | Describe a table's schema: field names, types, views |
| `airtable_list_records` | List records with data-quality tags (missing owner, missing due date, missing required field, stale) |
| `airtable_summarize_base_status` | Delivery status summary of a table: record count, data-quality issues, next actions |

Airtable tools require `OH_MY_PM_AIRTABLE_BASE_ID` and `OH_MY_PM_AIRTABLE_TOKEN`. Like the ClickUp connector, Airtable has no unauthenticated fallback — a missing token returns a degraded response rather than crashing. See `docs/airtable-connector.md`.

### Linear connector tools (v0.11.0)

| Tool | Description |
| --- | --- |
| `linear_list_issues` | List open issues in the configured team, with delivery tags (blocked, stale, unassigned, missing estimate, missing cycle) |
| `linear_summarize_issue` | Structured summary of a single issue by identifier (e.g. ENG-123) |
| `linear_summarize_project_status` | Delivery status summary of the configured team: issue counts, blockers, unassigned, missing estimates, missing cycles, next actions |
| `linear_list_teams` | List teams accessible to the configured token |
| `linear_list_projects` | List projects in the configured team |

Linear tools require `OH_MY_PM_LINEAR_TEAM_ID` and `OH_MY_PM_LINEAR_TOKEN`. Like the ClickUp and Airtable connectors, Linear has no unauthenticated fallback — a missing token returns a degraded response rather than crashing. The connector uses Linear's GraphQL API but sends only a small, fixed set of read-only queries — never a mutation. See `docs/linear-connector.md`.

### Jira connector tools (v0.12.0)

| Tool | Description |
| --- | --- |
| `jira_list_issues` | List open issues in the configured project, with delivery tags (blocked, stale, unassigned, missing estimate, missing sprint, overdue) |
| `jira_summarize_issue` | Structured summary of a single issue by key (e.g. PROJ-123) |
| `jira_summarize_project_status` | Delivery status summary of the configured project: issue counts, blockers, active sprint completion rate, next actions |
| `jira_list_projects` | List projects accessible to the configured site |
| `jira_list_boards` | List boards in the configured project |

Jira tools require `OH_MY_PM_JIRA_BASE_URL`, `OH_MY_PM_JIRA_PROJECT_KEY`, `OH_MY_PM_JIRA_EMAIL`, and `OH_MY_PM_JIRA_TOKEN`. Unlike the bearer-token connectors, Jira authenticates with HTTP Basic auth (email + API token) — a missing email or token returns a degraded response rather than crashing. The client issues only `GET` requests. See `docs/jira-connector.md`.

### Notion connector tools (v0.13.0)

| Tool | Description |
| --- | --- |
| `notion_search_pages` | Search the workspace for pages/databases accessible to the integration |
| `notion_summarize_page` | Structured summary of a single page: properties and metadata |
| `notion_query_database` | List database items with data-quality tags (missing owner, missing status, missing due date, stale), optional status filter |
| `notion_summarize_database` | Delivery status summary of a database: item count, data-quality issues, next actions |
| `notion_get_page_context` | Page properties plus first-level block children as plain-text content, bounded |

Notion tools require `OH_MY_PM_NOTION_TOKEN`, and at least one of `OH_MY_PM_NOTION_PAGE_ID` or `OH_MY_PM_NOTION_DATABASE_ID` for page/database-scoped tools. Like the ClickUp, Airtable, Linear, and Jira connectors, Notion has no unauthenticated fallback — a missing token returns a degraded response rather than crashing. Notion's `search` and `database query` endpoints are `POST` requests despite being read-only; the connector calls only these two documented read-only POST paths plus `GET`, and never a create/update/append/delete endpoint. See `docs/notion-connector.md`.

---

## Resources

| Resource URI | Description |
| --- | --- |
| `project://current` | Project identity: name, version, milestone state |
| `project://risks/open` | Open risk register (local template) |
| `project://decisions/open` | Open decisions (local template) |
| `clickup://workspace/current` | Current configured ClickUp workspace identity |
| `clickup://spaces` | Spaces in the configured ClickUp workspace (bounded) |
| `clickup://tasks/open` | Open tasks in the configured ClickUp list (bounded) |
| `airtable://base/current` | Current configured Airtable base identity |
| `airtable://tables` | Tables in the configured Airtable base (bounded) |
| `airtable://records/current` | Records in the configured Airtable table (bounded) |
| `linear://workspace/current` | Current configured Linear workspace identity |
| `linear://teams` | Teams accessible to the configured Linear token (bounded) |
| `linear://issues/open` | Open issues in the configured Linear team (bounded) |
| `jira://site/current` | Current configured Jira site identity |
| `jira://projects` | Projects accessible to the configured Jira site (bounded) |
| `jira://issues/open` | Open issues in the configured Jira project (bounded) |
| `notion://workspace/current` | Current configured Notion integration identity |
| `notion://pages/current` | Current configured Notion page's properties (bounded) |
| `notion://database/current` | Items in the configured Notion database (bounded) |

---

## Prompts

| Prompt | Description |
| --- | --- |
| `diagnose-project` | Full project diagnosis |
| `prepare-agent-handoff` | Agent handoff prompt |
| `summarize-delivery-status` | Delivery status summary |
| `summarize-clickup-delivery-status` | Delivery status using ClickUp list/task data |
| `diagnose-clickup-task-backlog` | ClickUp task backlog diagnosis |
| `prepare-clickup-project-handoff` | Handoff prompt seeded with ClickUp context |
| `summarize-airtable-base-status` | Delivery status using Airtable table/record data |
| `diagnose-airtable-data-quality` | Airtable data-quality diagnosis |
| `prepare-airtable-project-handoff` | Handoff prompt seeded with Airtable context |
| `summarize-linear-delivery-status` | Delivery status using Linear issue/project data |
| `diagnose-linear-issue-backlog` | Linear issue backlog diagnosis |
| `prepare-linear-project-handoff` | Handoff prompt seeded with Linear context |
| `summarize-jira-delivery-status` | Delivery status using Jira issue/board/sprint data |
| `diagnose-jira-issue-backlog` | Jira issue backlog diagnosis |
| `prepare-jira-project-handoff` | Handoff prompt seeded with Jira context |
| `summarize-notion-delivery-status` | Delivery status using Notion database/page data |
| `diagnose-notion-knowledge-base` | Notion knowledge-base diagnosis |
| `prepare-notion-project-handoff` | Handoff prompt seeded with Notion context |

---

## Install

```sh
cd packages/mcp-server
pnpm install
pnpm build
```

---

## Configure

Add to your MCP client config (e.g. `~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "node",
      "args": ["/absolute/path/to/oh-my-pm/packages/mcp-server/dist/index.js"],
      "env": {
        "OH_MY_PM_PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

---

## Environment variables

### Local context

| Variable | Description | Default |
| --- | --- | --- |
| `OH_MY_PM_PROJECT_ROOT` | Absolute path to the project root | `process.cwd()` |
| `OH_MY_PM_LOG_LEVEL` | Log level: debug, info, warn, error | `warn` |

### GitHub connector (v0.8.0)

| Variable | Required | Description |
| --- | --- | --- |
| `OH_MY_PM_GITHUB_OWNER` | Yes | GitHub repository owner (user or org) |
| `OH_MY_PM_GITHUB_REPO` | Yes | GitHub repository name |
| `OH_MY_PM_GITHUB_TOKEN` | No | Personal access token — needed for private repos and higher rate limits |
| `OH_MY_PM_GITHUB_API_BASE_URL` | No | Override API base URL for GitHub Enterprise (default: `https://api.github.com`) |

**Token security:** The token is read from the environment at startup only. It is never logged, never returned in tool output, and never included in error messages.

### ClickUp connector (v0.9.0)

| Variable | Required | Description |
| --- | --- | --- |
| `OH_MY_PM_CLICKUP_WORKSPACE_ID` | Yes | ClickUp workspace (team) ID |
| `OH_MY_PM_CLICKUP_TOKEN` | Yes | ClickUp API token — required for all reads, no unauthenticated fallback |
| `OH_MY_PM_CLICKUP_SPACE_ID` | No | Default space ID for space-scoped tools |
| `OH_MY_PM_CLICKUP_FOLDER_ID` | No | Default folder ID for folder-scoped tools |
| `OH_MY_PM_CLICKUP_LIST_ID` | No | Default list ID for list/task-scoped tools |
| `OH_MY_PM_CLICKUP_API_BASE_URL` | No | Override API base URL (default: `https://api.clickup.com/api/v2`) |

**Token security:** The token is read from the environment at startup only. It is never logged, never returned in tool output, and never included in error messages. When missing, tools return a degraded response instead of crashing.

### Airtable connector (v0.10.0)

| Variable | Required | Description |
| --- | --- | --- |
| `OH_MY_PM_AIRTABLE_BASE_ID` | Yes | Airtable base ID |
| `OH_MY_PM_AIRTABLE_TOKEN` | Yes | Airtable personal access token — required for all reads, no unauthenticated fallback |
| `OH_MY_PM_AIRTABLE_TABLE_ID` | No | Default table ID for table/record-scoped tools |
| `OH_MY_PM_AIRTABLE_TABLE_NAME` | No | Default table name, used if table ID is not set |
| `OH_MY_PM_AIRTABLE_API_BASE_URL` | No | Override API base URL (default: `https://api.airtable.com/v0`) |

**Token security:** The token is read from the environment at startup only. It is never logged, never returned in tool output, and never included in error messages. When missing, tools return a degraded response instead of crashing.

### Linear connector (v0.11.0)

| Variable | Required | Description |
| --- | --- | --- |
| `OH_MY_PM_LINEAR_TEAM_ID` | Yes | Linear team ID |
| `OH_MY_PM_LINEAR_TOKEN` | Yes | Linear API key — required for all reads, no unauthenticated fallback |
| `OH_MY_PM_LINEAR_WORKSPACE_ID` | No | Informational workspace ID |
| `OH_MY_PM_LINEAR_PROJECT_ID` | No | Default project ID for project-scoped tools |
| `OH_MY_PM_LINEAR_API_BASE_URL` | No | Override API base URL (default: `https://api.linear.app/graphql`) |

**Token security:** The token is read from the environment at startup only. It is never logged, never returned in tool output, and never included in error messages. When missing, tools return a degraded response instead of crashing.

### Jira connector (v0.12.0)

| Variable | Required | Description |
| --- | --- | --- |
| `OH_MY_PM_JIRA_BASE_URL` | Yes | Jira Cloud site base URL (e.g. `https://yourorg.atlassian.net`) |
| `OH_MY_PM_JIRA_EMAIL` | Yes | Account email — paired with the token for Basic auth |
| `OH_MY_PM_JIRA_TOKEN` | Yes | Jira API token — required for all reads, no unauthenticated fallback |
| `OH_MY_PM_JIRA_PROJECT_KEY` | Yes | Jira project key |
| `OH_MY_PM_JIRA_BOARD_ID` | No | Default board ID for board/sprint-scoped tools |

**Token security:** The email and token are read from the environment at startup only. Neither is logged, returned in tool output, or included in error messages. When either is missing, tools return a degraded response instead of crashing.

### Notion connector (v0.13.0)

| Variable | Required | Description |
| --- | --- | --- |
| `OH_MY_PM_NOTION_TOKEN` | Yes | Notion internal integration token — required for all reads, no unauthenticated fallback |
| `OH_MY_PM_NOTION_PAGE_ID` | No | Default page ID for page-scoped tools |
| `OH_MY_PM_NOTION_DATABASE_ID` | No | Default database ID for database-scoped tools |
| `OH_MY_PM_NOTION_API_BASE_URL` | No | Override API base URL (default: `https://api.notion.com/v1`) |

**Token security:** The token is read from the environment at startup only. It is never logged, never returned in tool output, and never included in error messages. When missing, tools return a degraded response instead of crashing. The Notion integration must be shared with the target page/database by a workspace member before use.

---

## Security

- Read-only. No write actions. No mutations in any tool.
- GitHub, ClickUp, Airtable, Linear, Jira, and Notion tokens (if set) are never logged, never returned in tool output, never in error messages.
- Sensitive local file patterns (`.env`, `*.key`, `*.pem`) are excluded from reads.
- Path traversal attempts are rejected.
- No background polling. No telemetry. No credential storage.
- The Linear connector never sends a GraphQL mutation. The Jira connector never calls a write endpoint (`POST`/`PUT`/`PATCH`/`DELETE`). The Notion connector calls only `GET` plus its two documented read-only `POST` endpoints (`/search`, `/databases/{id}/query`) — never a create/update/append/delete endpoint.

See `docs/mcp-security-policy.md`, `docs/github-connector.md`, `docs/clickup-connector.md`, `docs/airtable-connector.md`, `docs/linear-connector.md`, `docs/jira-connector.md`, and `docs/notion-connector.md` in the repository root.

---

## Development

```sh
pnpm typecheck   # type-check without building
pnpm test        # run all tests
pnpm build       # compile to dist/
pnpm start       # start the server (requires pnpm build first)
```

---

## Related docs

- `docs/mcp.md` — MCP planning and scope
- `docs/mcp-interface-design.md` — tool design and I/O shapes
- `docs/mcp-security-policy.md` — security policy
- `docs/mcp-alpha-scope.md` — resolved open questions for v0.7.0
- `docs/github-connector.md` — GitHub connector scope, tools, configuration, and failure behavior
- `docs/clickup-connector.md` — ClickUp connector scope, tools, configuration, and failure behavior
- `docs/airtable-connector.md` — Airtable connector scope, tools, configuration, and failure behavior
- `docs/linear-connector.md` — Linear connector scope, tools, configuration, and failure behavior
- `docs/jira-connector.md` — Jira connector scope, tools, configuration, and failure behavior
- `docs/notion-connector.md` — Notion connector scope, tools, configuration, and failure behavior
