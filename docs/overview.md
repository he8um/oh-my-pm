# Overview

Oh My PM is an open-source Head of Delivery agent kit for project, product, software, and marketing execution.

It is not a prompt pack. It is a reusable delivery leadership layer for AI agents.

## What it does

Oh My PM gives AI agents structured delivery thinking: how to prioritize, assess risk, plan delivery, communicate with stakeholders, and execute across project, product, software, and marketing contexts.

## How it works

You install one file (or a set of files) into your project or AI tool. Your agent then operates with the judgment of an experienced Head of Delivery.

| Tool | What you install |
|---|---|
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursor/rules/*.mdc` |
| Codex | `AGENTS.md` + `.agents/skills/oh-my-pm/` |
| ChatGPT | ChatGPT Skill zip |
| Generic agent | `AGENTS.md` |

## Key principles

- **Source of truth**: `AGENTS.md` defines all behavior. Tool-specific files are adapters.
- **Token discipline**: Outputs are dense and useful, not padded.
- **Bilingual first**: Persian and English are first-class workflow languages.
- **No lock-in**: Works with multiple AI tools. No proprietary dependencies.
- **No telemetry**: Installers are local and network-free.

## Related docs

- `architecture.md`
- `installation.md`
- `supported-tools.md`
