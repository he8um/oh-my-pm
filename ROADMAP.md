# Roadmap

Oh My PM follows the phased strategy: first become installable, then become useful, then become reliable, then become stable, then add MCP as an optional PM-focused integration layer.

## Version roadmap

| Version | Milestone |
| --- | --- |
| **v0.1.0-alpha** | Repository foundation + installable alpha packs — released |
| **v0.2.0** | Installer hardening + safer upgrades — released |
| **v0.3.0** | Bilingual FA/EN quality hardening — released |
| **v0.4.0** | Scenario testing + golden output evaluation — released |
| **v0.5.0** | Deep playbooks, templates, and examples expansion — released |
| **v0.6.0** | MCP research, interface design, and architecture docs — released |
| **v0.7.0** | Oh My PM MCP Server Alpha — TypeScript/Node, read-only — released |
| **v0.8.0** | GitHub Issues / Projects connector — released |
| v0.9.0 | ClickUp connector — released |
| v0.10.0 | Airtable connector — released |
| **v0.11.0** | Linear connector — next |
| v0.12.0 | Jira connector |
| v0.13.0 | Notion connector |
| v1.0.0 | Stable install contract + stable core + optional MCP support |

## MCP integration

MCP (Model Context Protocol) support is planned as a **future optional integration layer** starting at v0.7.0.

MCP will be PM-focused and read-only at first. Write actions will come later behind explicit confirmation and policy.

MCP will not replace or alter the core agent behavior defined in `AGENTS.md`. It is an optional data access layer on top of the existing delivery agent kit.

See `docs/mcp.md` for full MCP plans.

## What is not on the roadmap

- A dashboard (not before stable MCP)
- A generic automation platform
- Vendor lock-in to any specific AI provider
- Telemetry or data collection

## Related docs

- `CHANGELOG.md`
- `docs/mcp.md`
- `docs/architecture.md`
- `VERSIONING.md`
