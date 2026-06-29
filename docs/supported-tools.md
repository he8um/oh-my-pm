# Supported Tools

## Current support

| Tool | Status | Install method |
|---|---|---|
| Claude Code | ✅ Supported | `bash installers/install-claude.sh` |
| Cursor | ✅ Supported | `bash installers/install-cursor.sh` |
| Codex | ✅ Supported | `bash installers/install-codex.sh` |
| ChatGPT | ✅ Supported | Download ChatGPT Skill zip from Releases |
| Generic (AGENTS.md) | ✅ Supported | Copy `packs/generic/AGENTS.md` |

## Planned support

| Tool | Planned version | Notes |
|---|---|---|
| MCP-compatible agents | v0.7.0 | Read-only PM-focused MCP server |

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
