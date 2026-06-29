# Changelog

All notable changes to Oh My PM are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [VERSIONING.md](VERSIONING.md).

---

## [v0.1.0-alpha] — 2024

### Added

- Initial repository foundation for Oh My PM
- `AGENTS.md` — source of truth for agent behavior
- `CLAUDE.md` — Claude Code adapter
- `.cursor/rules/` — Cursor rules (9 files)
- `chatgpt-skill/oh-my-pm/` — ChatGPT Skill skeleton
- `codex-skill/oh-my-pm/` — Codex Skill skeleton
- `packs/claude/`, `packs/cursor/`, `packs/codex/`, `packs/generic/` — installable packs
- `installers/` — safe install, uninstall, and verify scripts
- `scripts/` — validation and release build scripts
- `docs/` — public documentation (14 files)
- `glossary/fa-en.md` — Persian/English terminology glossary
- `templates/en/` and `templates/fa/` — paired bilingual templates
- `prompts/en/` and `prompts/fa/` — paired bilingual prompts
- `examples/` — synthetic project examples
- `tests/scenarios/` and `tests/golden/` — scenario and golden output starters
- `.github/workflows/` — CI validation and release workflows
- `.github/ISSUE_TEMPLATE/` — bug, feature, and bilingual quality templates
- GitHub Actions for validation and release

### Notes

- This is an alpha release. The install contract may change before v1.0.0.
- MCP support is planned for v0.7.0 as a future optional integration layer.
- See `ROADMAP.md` for the full version roadmap.
