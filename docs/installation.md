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
--dry-run       Preview what would be installed without making changes
--force         Replace existing CLAUDE.md
--backup        Create a timestamped backup before replacing (use with --force)
--target DIR    Install to a specific target directory (default: current directory)
--self-test     Verify installer preconditions without modifying files
--version       Print pack version and exit
--help          Show usage and exit
```

## Install for Cursor

```bash
bash installers/install-cursor.sh
```

Options:

```bash
--dry-run       Preview what would be installed
--force         Replace existing rule files
--backup        Create a timestamped backup before replacing (use with --force)
--target DIR    Install to a specific target directory
--self-test     Verify installer preconditions without modifying files
--version       Print pack version and exit
--help          Show usage and exit
```

## Install for Codex

```bash
bash installers/install-codex.sh
```

Options:

```bash
--dry-run       Preview what would be installed
--force         Replace existing AGENTS.md and skill files
--backup        Create a timestamped backup before replacing (use with --force)
--target DIR    Install to a specific target directory
--self-test     Verify installer preconditions without modifying files
--version       Print pack version and exit
--help          Show usage and exit
```

## Install ChatGPT Skill

1. Download `oh-my-pm-vX.Y.Z-chatgpt-skill.zip` from [Releases](https://github.com/he8um/oh-my-pm/releases).
2. Unzip and upload `SKILL.md` as a custom GPT context file.

## Verify installation

```bash
bash installers/verify-install.sh
```

Checks that installed files are in place. Supports `--scope <claude|cursor|codex|all>` and `--target DIR`.

## Uninstall

```bash
bash installers/uninstall-claude.sh
bash installers/uninstall-cursor.sh
bash installers/uninstall-codex.sh
```

All uninstallers support `--dry-run`, `--force`, `--target DIR`, `--self-test`, and `--help`.

## Upgrade safely

Use `--force --backup` to upgrade an existing install with a timestamped backup:

```bash
bash installers/install-claude.sh --force --backup
```

The installer prints the backup path and a restore command. See `docs/upgrading.md` for rollback instructions.

## Related docs

- `upgrading.md`
- `compatibility.md`
- `supported-tools.md`
