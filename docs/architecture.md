# Architecture

## File hierarchy

```txt
AGENTS.md                    ← Source of truth for all agent behavior
├── CLAUDE.md                ← Adapter for Claude Code
├── .cursor/rules/*.mdc      ← Adapter for Cursor
├── chatgpt-skill/           ← Adapter for ChatGPT Skills
│   └── oh-my-pm/SKILL.md
├── codex-skill/             ← Adapter for Codex Skills
│   └── oh-my-pm/SKILL.md
└── packs/                   ← Installable packs (one per target)
    ├── claude/
    ├── cursor/
    ├── codex/
    └── generic/
```

## Source of truth rule

`AGENTS.md` defines all behavioral policy: role, domains, behaviors, language policy, and trigger contexts.

Tool-specific files are adapters. They format the core for each tool's conventions. They do not introduce new policy or contradict `AGENTS.md`.

In case of conflict, `AGENTS.md` takes precedence.

## Packs

Packs are self-contained installable directories. Each pack includes everything needed to install Oh My PM for a specific tool.

The installer scripts in `installers/` copy files from `packs/` into user projects.

## Skills

Skills (`chatgpt-skill/` and `codex-skill/`) are installable extensions for ChatGPT and Codex. They include `SKILL.md`, `VERSION`, `agents/openai.yaml`, and reference documents.

## Scripts

`scripts/` contains validation and packaging scripts:

- `validate-agent-files.sh` — checks core agent files
- `validate-skill.sh` — checks skill structure
- `validate-bilingual.sh` — checks FA/EN parity
- `validate-release.sh` — checks VERSION parity and dist safety
- `build-release.sh` — runs all validation and creates release assets
- `package-*.sh` — packages individual assets
- `generate-checksums.sh` — generates SHA-256 checksums
- `check-links.sh` — checks internal references

## MCP (future)

MCP support is planned for v0.7.0 as a future optional integration layer.

It will live in `packages/mcp-server/` and provide PM-focused read-only access to project tools.

MCP will not replace or modify the core agent behavior in `AGENTS.md`.

See `docs/mcp.md` for the full MCP roadmap.

## dist/

`dist/` holds generated release assets. Only `dist/.gitkeep` is committed. All zips and generated reports are gitignored and produced by `build-release.sh`.
