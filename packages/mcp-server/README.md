# Oh My PM MCP Server

Read-only MCP server for Oh My PM — local context tools and GitHub connector for delivery agents.

**Version:** v0.8.0  
**Transport:** stdio (local only)  
**Status:** Alpha

---

## What this is

The Oh My PM MCP server gives MCP-compatible clients (Claude Code, Cursor, etc.) structured access to local project context and GitHub Issues/Milestones.

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

---

## Resources

| Resource URI | Description |
| --- | --- |
| `project://current` | Project identity: name, version, milestone state |
| `project://risks/open` | Open risk register (local template) |
| `project://decisions/open` | Open decisions (local template) |

---

## Prompts

| Prompt | Description |
| --- | --- |
| `diagnose-project` | Full project diagnosis |
| `prepare-agent-handoff` | Agent handoff prompt |
| `summarize-delivery-status` | Delivery status summary |

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

---

## Security

- Read-only. No write actions. No mutations in any tool.
- GitHub token (if set) is never logged, never returned in tool output, never in error messages.
- Sensitive local file patterns (`.env`, `*.key`, `*.pem`) are excluded from reads.
- Path traversal attempts are rejected.
- No background polling. No telemetry. No credential storage.

See `docs/mcp-security-policy.md` and `docs/github-connector.md` in the repository root.

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
