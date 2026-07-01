# Oh My PM MCP Server

Read-only MCP server for Oh My PM — local context tools, GitHub connector, ClickUp connector, and Airtable connector for delivery agents.

**Version:** v0.10.0  
**Transport:** stdio (local only)  
**Status:** Alpha

---

## What this is

The Oh My PM MCP server gives MCP-compatible clients (Claude Code, Cursor, etc.) structured access to local project context, GitHub Issues/Milestones, ClickUp workspace/list/task data, and Airtable base/table/record data.

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

---

## Security

- Read-only. No write actions. No mutations in any tool.
- GitHub, ClickUp, and Airtable tokens (if set) are never logged, never returned in tool output, never in error messages.
- Sensitive local file patterns (`.env`, `*.key`, `*.pem`) are excluded from reads.
- Path traversal attempts are rejected.
- No background polling. No telemetry. No credential storage.

See `docs/mcp-security-policy.md`, `docs/github-connector.md`, `docs/clickup-connector.md`, and `docs/airtable-connector.md` in the repository root.

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
