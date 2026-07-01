# Oh My PM MCP Server

Read-only MCP server alpha for Oh My PM — local context tools for delivery agents.

**Version:** v0.7.0  
**Transport:** stdio (local only)  
**Status:** Alpha

---

## What this is

The Oh My PM MCP server gives MCP-compatible clients (Claude Code, Cursor, etc.) structured access to local project context without requiring any external connector or credentials.

This is a local-only, read-only server. No write actions. No external API calls. No authentication required.

---

## Tools

| Tool | Description |
| --- | --- |
| `inspect_project_context` | Read project identity from local repo (AGENTS.md, VERSION, README.md) |
| `diagnose_project` | Structured project diagnosis from local context |
| `prepare_agent_handoff` | Self-contained handoff prompt from current context |
| `summarize_delivery_status` | Delivery status from ROADMAP.md and CHANGELOG.md |

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

| Variable | Description | Default |
| --- | --- | --- |
| `OH_MY_PM_PROJECT_ROOT` | Absolute path to the project root | `process.cwd()` |
| `OH_MY_PM_LOG_LEVEL` | Log level: debug, info, warn, error | `warn` |

---

## Security

- No credentials required or accepted in v0.7.0.
- Read-only. No write actions. No mutations.
- No external network calls.
- Sensitive file patterns (`.env`, `*.key`, `*.pem`) are excluded from reads.
- Path traversal attempts are rejected.

See `docs/mcp-security-policy.md` in the repository root for the full security policy.

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
