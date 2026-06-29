# Upgrading

## General upgrade process

1. Check `CHANGELOG.md` for breaking changes.
2. Check `compatibility.md` for compatibility notes.
3. Run `bash installers/install-<tool>.sh --force --backup` to upgrade with backup.
4. Verify with `bash installers/verify-install.sh`.

## Before v1.0.0

The install contract may change between minor versions before v1.0.0.

This means file locations, file names, or required content may change.

Always read the `CHANGELOG.md` before upgrading.

## Backing up before upgrade

All installers support `--backup`:

```bash
bash installers/install-claude.sh --force --backup
bash installers/install-cursor.sh --force --backup
bash installers/install-codex.sh --force --backup
```

This creates a timestamped backup directory before replacing files:

```txt
.backup-oh-my-pm-YYYYMMDD-HHMMSS/
```

The installer prints the backup path and a restore command when the backup is created.

## Previewing an upgrade

Use `--dry-run` to see what would change before applying:

```bash
bash installers/install-claude.sh --dry-run
```

No files are modified in dry-run mode.

## Conflict detection

If a target file already exists and `--force` is not set, the installer prints a conflict message and exits without making changes. This protects existing customizations.

## Self-test before upgrading

Run the self-test to verify installer preconditions:

```bash
bash installers/install-claude.sh --self-test
bash installers/install-cursor.sh --self-test
bash installers/install-codex.sh --self-test
```

Self-test does not modify files.

## Rollback if upgrade breaks something

If the upgrade fails after a backup was created, restore from the backup path printed during install:

```bash
# Example restore for Claude
cp .backup-oh-my-pm-<timestamp>/CLAUDE.md <target>/CLAUDE.md

# Example restore for Cursor rules
cp .backup-oh-my-pm-<timestamp>/.cursor/rules/*.mdc <target>/.cursor/rules/
```

Then verify:

```bash
bash installers/verify-install.sh
```

If you cannot recover, check `CHANGELOG.md` for migration notes and open an issue at [github.com/he8um/oh-my-pm/issues](https://github.com/he8um/oh-my-pm/issues).

## Related docs

- `installer-spec.md`
- `compatibility.md`
- `VERSIONING.md`
- `CHANGELOG.md`
