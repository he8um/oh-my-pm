# FAQ

## What is Oh My PM?

Oh My PM is an open-source Head of Delivery agent kit for project, product, software, and marketing execution.

It installs into your AI tool (Claude, Cursor, Codex, ChatGPT) and gives your agent the thinking and structure of an experienced delivery leader.

## Is this a prompt pack?

No. It is a reusable delivery leadership layer for AI agents.

A prompt pack gives you one-off prompts. Oh My PM gives your agent a persistent behavioral layer: structured intake, delivery judgment, stakeholder communication, and token discipline.

## Which AI tools are supported?

Claude Code, Cursor, Codex, ChatGPT, and any AGENTS.md-compatible agent.

See `docs/supported-tools.md`.

## Does it support Persian?

Yes. Persian and English are first-class workflow languages. The agent matches your language, uses natural Persian for management contexts, and preserves English for technical identifiers.

See `docs/bilingual-support.md`.

## Does it collect data or make network calls?

No. Installers are local and network-free. No telemetry. No credentials required.

## What is MCP support?

MCP support is optional and read-only. It ships with six connectors — GitHub, ClickUp, Airtable, Linear, Jira, and Notion — that give your agent project context without granting write access. It requires local configuration and environment variables; it does not collect telemetry or store credentials.

See `docs/mcp.md`.

## Can I use Oh My PM in a commercial project?

Yes. Oh My PM is MIT-licensed. See `LICENSE`.

## How do I report a bug?

Open an issue using the bug report template in the GitHub repository.

## Why do AGENTS.md or CLAUDE.md not appear in git status?

Some developers have these filenames in their global Git ignore file (for example, `~/.config/git/ignore`). This silently hides changes to `AGENTS.md` and `CLAUDE.md` from `git status`.

To check:

```bash
git check-ignore -v AGENTS.md
git check-ignore -v CLAUDE.md
```

If a global rule is the cause, stage the files with:

```bash
git add -f AGENTS.md CLAUDE.md
```

Both files are required tracked source files in this repository. Do not remove or rename them.

See `CONTRIBUTING.md` for full details.

## How do I contribute?

See `CONTRIBUTING.md`.
