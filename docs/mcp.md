# MCP Integration (Future)

MCP (Model Context Protocol) support is planned as a **future optional integration layer** for Oh My PM.

MCP is **not available in the current version**. It is planned for v0.7.0.

## What MCP will provide

MCP will give Oh My PM agents optional access to live project data from PM tools such as:

- GitHub Issues / Projects
- ClickUp
- Airtable
- Linear
- Jira
- Notion

This is a data access layer, not a replacement for the core agent behavior in `AGENTS.md`.

## What MCP will not do

- Replace `AGENTS.md`, `CLAUDE.md`, Cursor rules, Skill files, or packs.
- Become a generic automation platform.
- Include write actions without explicit confirmation.
- Collect telemetry or send data without user consent.

## Design principles

- PM-focused only. Not a generic integration platform.
- Read-only at first (v0.7.0 alpha). Write actions come later.
- One connector per version.
- Tool names stay English. Output language follows user/project language.
- No dashboard before stable MCP.

## Planned stack

```
Runtime: Node.js
Language: TypeScript
Package manager: pnpm
Path: packages/mcp-server/
```

## Connector roadmap

| Version | Connector |
|---|---|
| v0.8.0 | GitHub Issues / Projects |
| v0.9.0 | ClickUp |
| v0.10.0 | Airtable |
| v0.11.0 | Linear |
| v0.12.0 | Jira |
| v0.13.0 | Notion |

## Current status

MCP is documented here as a future plan. No `packages/mcp-server/` exists in this version.

See `ROADMAP.md` for the full version plan.
