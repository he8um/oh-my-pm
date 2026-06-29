# Installer Specification

This document describes the installer behavior contract for Oh My PM.

## Supported installers

| Script | Purpose |
| --- | --- |
| `installers/install-claude.sh` | Install Claude Code pack |
| `installers/install-cursor.sh` | Install Cursor pack |
| `installers/install-codex.sh` | Install Codex pack |
| `installers/uninstall-claude.sh` | Remove Claude Code pack |
| `installers/uninstall-cursor.sh` | Remove Cursor pack |
| `installers/uninstall-codex.sh` | Remove Codex pack |
| `installers/verify-install.sh` | Verify installation |

## Supported flags

All install scripts support:

| Flag | Effect |
| --- | --- |
| `--dry-run` | Print planned actions without making changes |
| `--force` | Allow overwrite of existing files |
| `--backup` | Create a timestamped backup before replacing (use with `--force`) |
| `--target DIR` | Install into DIR instead of current directory |
| `--self-test` | Verify script preconditions without modifying files |
| `--version` | Print the pack version and exit |
| `--help` | Show usage and exit |

Uninstall scripts support: `--dry-run`, `--force`, `--target`, `--self-test`, `--help`.

## Non-negotiable rules

- No destructive overwrite by default.
- Backup before replacement (with `--force --backup`).
- Support `--dry-run`: print actions without executing.
- Support `--force`: allow replacement of existing files.
- Support `--backup`: create a timestamped backup before replacing.
- Support `--target DIR`: install to a specified directory.
- No telemetry.
- No network calls.
- No `curl | bash` pattern.
- Print clear actions.
- Fail clearly with a non-zero exit code on error.
- Use `set -eu` for safe shell baseline.
- Quote all shell variables.

## Install targets

| Tool | Files installed |
| --- | --- |
| Claude | `CLAUDE.md` |
| Cursor | `.cursor/rules/*.mdc` |
| Codex | `AGENTS.md`, `.agents/skills/oh-my-pm/` |

## Conflict detection

Installers detect existing files before overwriting. If a conflict is found and `--force` is not set, the installer prints the conflict and available options, then exits cleanly without modifying files.

## Upgrade behavior

| Situation | Behavior |
| --- | --- |
| Same file already installed | Skip unless `--force` |
| Different version installed | Conflict reported; use `--force --backup` to upgrade |

## Backup format

Backups use the format `.backup-oh-my-pm-YYYYMMDD-HHMMSS/` in the target directory.

Example:

```txt
.backup-oh-my-pm-20260629153000/CLAUDE.md
```

The installer prints the backup path and the restore command when a backup is created.

**Manual restore:**

```bash
cp .backup-oh-my-pm-<timestamp>/CLAUDE.md <target>/CLAUDE.md
```

Backups are not deleted automatically. Remove old backups manually when no longer needed.

## Rollback behavior

If an install fails after a backup was created, the installer prints the restore command. No automatic rollback is performed. Use the printed command to restore manually.

## Uninstall behavior

- Remove only files installed by Oh My PM.
- For files that may contain user modifications (e.g. `AGENTS.md`), print a note instead of deleting automatically.
- Prompt for confirmation before destructive actions (skipped with `--force`).
- Exit cleanly when nothing is installed.
- Never remove backup directories.

## Self-test behavior

`--self-test` verifies preconditions without modifying any files:

- Repository root is locatable.
- Pack directory and source files exist.
- VERSION file exists.
- Script is readable.

Returns exit code 0 on pass, non-zero on failure.

## Verify behavior

`verify-install.sh` checks:

- Required installed files are present.
- No zip files were accidentally installed.

Supports `--scope <claude|cursor|codex|all>` and `--target DIR`.
