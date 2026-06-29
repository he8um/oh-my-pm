# Changelog

All notable changes to Oh My PM are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [VERSIONING.md](VERSIONING.md).

---

## [v0.2.0] — 2026-06-29

### Added in v0.2.0

- `--self-test` flag on all install and uninstall scripts — verifies preconditions without modifying files
- `--version` flag on install scripts — prints pack version and exits
- `--help` flag on all installer scripts — prints usage and exits
- `--force` flag on uninstall scripts — skips confirmation prompt
- `--backup` flag on `install-cursor.sh` and `install-codex.sh` — creates timestamped backup before replacing
- `--scope <claude|cursor|codex|all>` flag on `verify-install.sh` — scope-targeted verification
- Conflict detection in all install scripts — prints conflict and available options instead of silently skipping
- Version-aware upgrade path — install scripts detect existing files and guide upgrade with `--force --backup`
- Backup rotation format: `.backup-oh-my-pm-YYYYMMDD-HHMMSS/` in the target directory
- Rollback instructions printed after backup creation
- `set -eu` safe shell baseline in all installer scripts
- `--target` argument parsing hardened — rejects empty or missing values with a clear error
- Unknown flag detection — all scripts now exit with an error on unrecognised options
- Installer existence and executability checks in `validate-agent-files.sh`
- Installer flag presence checks (`--self-test`, `--help`, `--backup`) in `validate-agent-files.sh`
- `install.json` existence check in `validate-agent-files.sh`

### Changed in v0.2.0

- `install-claude.sh`: upgraded from `set -e` to `set -eu`; argument parsing changed from `for` loop to `while/case` for correct `--target` value handling
- `install-cursor.sh`: added `--backup`, `set -eu`, conflict detection, `--help`, `--self-test`, `--version`
- `install-codex.sh`: added `--backup`, `set -eu`, conflict detection for `AGENTS.md`, `--help`, `--self-test`, `--version`; pre-flight checks added for source and target directories
- `uninstall-claude.sh`, `uninstall-cursor.sh`, `uninstall-codex.sh`: added `set -eu`, `--force`, `--self-test`, `--help`; clean exit when nothing is installed
- `verify-install.sh`: added `--scope`, `--help`; additional Cursor rule checks; replaced `for arg in "$@"` loop with `while/case` for correct option parsing
- `docs/installer-spec.md`: expanded with upgrade behavior, conflict detection, backup format, rollback, self-test, and flag table
- `docs/upgrading.md`: expanded with dry-run, conflict detection, self-test, and rollback instructions
- `docs/installation.md`: updated flag tables for all three installers; added upgrade section
- `docs/security-model.md`: added `--self-test`, `set -eu`, and generated asset commitment notes

---

## [v0.1.0-alpha] — 2024

### Added in v0.1.0-alpha

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

### Notes for v0.1.0-alpha

- This is an alpha release. The install contract may change before v1.0.0.
- MCP support is planned for v0.7.0 as a future optional integration layer.
- See `ROADMAP.md` for the full version roadmap.
