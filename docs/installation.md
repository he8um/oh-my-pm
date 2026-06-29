# Installation

## Prerequisites

- A project directory where you want to install Oh My PM.
- The oh-my-pm repository cloned or downloaded locally.

## Install for Claude Code

```bash
# From the oh-my-pm repository root:
bash installers/install-claude.sh
```

Options:

```bash
--dry-run     Preview what would be installed without making changes
--force       Replace existing CLAUDE.md
--backup      Create a backup before replacing (use with --force)
--target DIR  Install to a specific target directory (default: current directory)
```

## Install for Cursor

```bash
bash installers/install-cursor.sh
```

Options:

```bash
--dry-run     Preview what would be installed
--force       Replace existing rule files
--target DIR  Install to a specific target directory
```

## Install for Codex

```bash
bash installers/install-codex.sh
```

Options:

```bash
--dry-run     Preview what would be installed
--force       Replace existing AGENTS.md
--target DIR  Install to a specific target directory
```

## Install ChatGPT Skill

1. Download `oh-my-pm-vX.Y.Z-chatgpt-skill.zip` from [Releases](https://github.com/he8um/oh-my-pm/releases).
2. Unzip and upload `SKILL.md` as a custom GPT context file.

## Verify installation

```bash
bash installers/verify-install.sh
```

Checks that installed files are in place.

## Uninstall

```bash
bash installers/uninstall-claude.sh
bash installers/uninstall-cursor.sh
bash installers/uninstall-codex.sh
```

All uninstallers support `--dry-run` and `--target DIR`.

## Related docs

- `upgrading.md`
- `compatibility.md`
- `supported-tools.md`
