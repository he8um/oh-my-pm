# Supported Tools

## Current support

| Tool | Status | Install method |
| --- | --- | --- |
| Claude Code | ✅ Supported | `bash installers/install-claude.sh` |
| Cursor | ✅ Supported | `bash installers/install-cursor.sh` |
| Codex | ✅ Supported | `bash installers/install-codex.sh` |
| ChatGPT | ✅ Supported | Download ChatGPT Skill zip from Releases |
| Generic (AGENTS.md) | ✅ Supported | Copy `packs/generic/AGENTS.md` |

## Planned support

| Tool | Planned version | Notes |
| --- | --- | --- |
| MCP-compatible agents | v0.7.0 | Read-only MCP server alpha — local context only — shipped |
| GitHub Issues / Projects connector | v0.8.0 | Read-only — in progress |
| ClickUp | v0.9.0 | MCP connector — read-only |
| Airtable | v0.10.0 | MCP connector — read-only |
| Linear | v0.11.0 | MCP connector — read-only |
| Jira | v0.12.0 | MCP connector — read-only |
| Notion | v0.13.0 | MCP connector — read-only |

## MCP status

MCP (Model Context Protocol) is an optional integration layer available as an alpha in v0.7.0.

- v0.6.0: Interface design, security policy, and connector roadmap documented
- v0.7.0: MCP server alpha — read-only, local context only, stdio transport, no external connector required — **shipped**
- v0.8.0+: External connectors added one per version

Install: `cd packages/mcp-server && npm install && npm run build`. Configure via `examples/client-config.example.json`.

Existing packs (Claude Code, Cursor, Codex, ChatGPT, generic) remain the primary installation method. MCP is an optional data-access add-on, not a replacement.

See `docs/mcp.md` and `docs/mcp-alpha-scope.md` for the full MCP roadmap and resolved alpha scope.

## Tool-specific notes

### Claude Code

Install `CLAUDE.md` into your project root. Claude Code reads this file automatically.

The pack at `packs/claude/` adapts `AGENTS.md` for Claude Code format.

### Cursor

Install `.cursor/rules/*.mdc` into your project. Cursor applies these as rule files based on context.

Rules are named with numeric prefixes (00, 10, 20...) to control load order. Rules 00 and 90 are always-apply; others activate by context.

### Codex

Install `AGENTS.md` and `.agents/skills/oh-my-pm/` into your project. The Codex Skill includes reference documents for all supported domains.

### ChatGPT

Download the ChatGPT Skill zip from the Releases page. Upload `SKILL.md` as a custom GPT context file.

### Generic agents

Copy `packs/generic/AGENTS.md` into your project. Any agent that reads `AGENTS.md` will apply Oh My PM behaviors.
