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

## Layer model

Oh My PM has three layers. Only the first two layers exist today.

```txt
Layer 1 — Core skill layer (current)
  AGENTS.md                    ← Source of truth: role, behaviors, language policy
  └── Tool adapters            ← CLAUDE.md, .cursor/rules/, SKILL.md files

Layer 2 — Installable pack layer (current)
  packs/                       ← Self-contained packs for each target tool
  installers/                  ← Install, uninstall, verify scripts
  chatgpt-skill/, codex-skill/ ← Skill packages for ChatGPT and Codex

Layer 3 — MCP integration layer (future, v0.7.0+)
  packages/mcp-server/         ← TypeScript/Node MCP server (does not exist yet)
  └── connectors/              ← One connector per version (v0.8.0+)
```

Layer 3 is optional. Layers 1 and 2 are fully functional without MCP.

## MCP layer design

The MCP layer is an optional data-access add-on. It does not change agent behavior, role, or judgment.

**Why MCP is optional:**
Teams that provide project context manually still benefit fully from Oh My PM. MCP reduces friction for teams who want live data access from connected PM tools.

**Why MCP must not contradict skill behavior:**
`AGENTS.md` defines all behavioral policy. The MCP server provides data — it does not define how the agent uses that data. Agent judgment, output structure, and delivery behaviors come from `AGENTS.md`.

**How MCP relates to AGENTS.md:**
The agent reads MCP tool output and applies the same delivery reasoning it applies to manually-provided context. MCP data is input; `AGENTS.md` governs behavior.

**Planned MCP path:** `packages/mcp-server/` — does not exist in v0.6.0.

**Planned stack:** TypeScript, Node.js, pnpm.

**Read-only first:** v0.7.0 MCP server will be read-only. Write actions require per-action policy review before any connector enables them.

See `docs/mcp.md` for the full MCP roadmap and `docs/mcp-interface-design.md` for interface design.

## dist/

`dist/` holds generated release assets. Only `dist/.gitkeep` is committed. All zips and generated reports are gitignored and produced by `build-release.sh`.
