# Installer Specification

This document describes the installer behavior contract for Oh My PM.

## Supported installers

| Script | Purpose |
|---|---|
| `installers/install-claude.sh` | Install Claude Code pack |
| `installers/install-cursor.sh` | Install Cursor pack |
| `installers/install-codex.sh` | Install Codex pack |
| `installers/uninstall-claude.sh` | Remove Claude Code pack |
| `installers/uninstall-cursor.sh` | Remove Cursor pack |
| `installers/uninstall-codex.sh` | Remove Codex pack |
| `installers/verify-install.sh` | Verify installation |

## Non-negotiable rules

- No destructive overwrite by default.
- Backup before replacement (with `--force --backup`).
- Support `--dry-run`: print actions without executing.
- Support `--force`: allow replacement of existing files.
- Support `--backup`: create a timestamped backup before replacing.
- Support `--target DIR`: install to a specified directory.
- No telemetry.
- No network calls.
- Print clear actions.
- Fail clearly with a non-zero exit code on error.

## Install targets

| Tool | Files installed |
|---|---|
| Claude | `CLAUDE.md` |
| Cursor | `.cursor/rules/*.mdc` |
| Codex | `AGENTS.md`, `.agents/skills/oh-my-pm/` |

## Uninstall behavior

- Remove only files installed by Oh My PM.
- For files that may contain user modifications (e.g. `AGENTS.md`), print a warning instead of deleting automatically.
- Prompt for confirmation before destructive actions.

## Verify behavior

`verify-install.sh` checks:

- Required files are present.
- No zip files were accidentally installed.
