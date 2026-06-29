# Oh My PM

**Oh My PM** is an open-source Head of Delivery agent kit for project, product, software, and marketing execution.

Oh My PM is not a prompt pack. It is a reusable delivery leadership layer for AI agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.0--alpha-blue.svg)](CHANGELOG.md)

---

## What is Oh My PM?

Oh My PM gives AI agents the thinking, judgment, and structure of a Head of Delivery.

Instead of writing the same project management instructions from scratch every time, you install Oh My PM once and your agent gains:

- Structured delivery leadership behavior
- Project, product, software, and marketing execution patterns
- Token-efficient agent workflows
- Persian/English bilingual support
- Playbooks, templates, and structured prompts

---

## Why it exists

AI agents are excellent at generating content but often lack delivery judgment: how to prioritize, how to assess risk, how to write stakeholder updates, how to manage scope, and how to think like a Head of Delivery.

Oh My PM fills this gap with a reusable, installable, open-source delivery layer.

---

## Who it is for

- Product managers using AI agents
- Engineering leads and delivery managers
- Teams using ChatGPT, Claude, Cursor, or Codex for delivery work
- Anyone who needs a structured AI delivery partner

---

## Supported tools

| Tool | Support |
| --- | --- |
| Claude Code | ✅ via `CLAUDE.md` |
| Cursor | ✅ via `.cursor/rules/` |
| Codex | ✅ via `AGENTS.md` + Codex Skill |
| ChatGPT | ✅ via ChatGPT Skill |
| Generic agents | ✅ via `AGENTS.md` |
| Future MCP | 🗓 Planned — v0.7.0 |

---

## Quick start

### Install for Claude Code

```bash
# From this repository root:
bash installers/install-claude.sh
```

This copies `CLAUDE.md` into your project root. If `CLAUDE.md` already exists, it will not overwrite.

To force replace with backup:

```bash
bash installers/install-claude.sh --force --backup
```

To preview without changing anything:

```bash
bash installers/install-claude.sh --dry-run
```

### Install for Cursor

```bash
bash installers/install-cursor.sh
```

This copies `.cursor/rules/*.mdc` files into your project.

### Install for Codex

```bash
bash installers/install-codex.sh
```

This copies `AGENTS.md` and the Codex Skill into your project.

### Install as ChatGPT Skill

1. Download the latest `oh-my-pm-v0.2.0-chatgpt-skill.zip` from [Releases](https://github.com/he8um/oh-my-pm/releases).
2. Unzip and upload `SKILL.md` as a custom GPT context file, or follow the ChatGPT Skill import process.

---

## Bilingual Persian/English support

Oh My PM supports Persian and English as first-class workflow languages.

- Agent output matches the user's language by default.
- Persian is used for management, delivery, stakeholder, and decision contexts.
- English is preserved for code, CLI, APIs, schemas, and technical identifiers.
- Bilingual templates and prompts are provided in `templates/fa/` and `prompts/fa/`.
- See `docs/bilingual-support.md` for full details.

---

## Release assets

Each release includes:

| Asset | Description |
| --- | --- |
| `oh-my-pm-vX.Y.Z-chatgpt-skill.zip` | ChatGPT Skill package |
| `oh-my-pm-vX.Y.Z-codex-skill.zip` | Codex Skill package |
| `oh-my-pm-vX.Y.Z-claude-pack.zip` | Claude Code pack |
| `oh-my-pm-vX.Y.Z-cursor-pack.zip` | Cursor pack |
| `oh-my-pm-vX.Y.Z-generic-agent-pack.zip` | Generic AGENTS.md pack |
| `checksums.txt` | SHA-256 checksums |
| `validation-report.md` | Release validation results |

---

## Security and privacy

- Oh My PM makes no network calls.
- Installers do not collect telemetry.
- No secrets, credentials, or private data are included.
- See `SECURITY.md` for the full security model.

---

## Roadmap

| Version | Milestone |
| --- | --- |
| v0.1.0-alpha | Repository foundation + installable alpha packs |
| v0.2.0 | Installer hardening + safer upgrades |
| v0.3.0 | Bilingual FA/EN quality hardening |
| v0.4.0 | Scenario testing + golden output evaluation |
| v0.5.0 | Deep playbooks, templates, and examples |
| v0.6.0 | MCP research and architecture docs |
| v0.7.0 | Oh My PM MCP Server Alpha (read-only) |
| v0.8.0–v0.13.0 | PM tool connectors (GitHub, ClickUp, Airtable, Linear, Jira, Notion) |
| v1.0.0 | Stable install contract |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
