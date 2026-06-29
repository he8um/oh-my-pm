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
```

This creates a timestamped backup of the existing file before replacing it.

## If upgrade breaks something

- Check `CHANGELOG.md` for migration notes.
- Restore from your backup file.
- Open an issue at https://github.com/he8um/oh-my-pm/issues.

## Related docs

- `compatibility.md`
- `VERSIONING.md`
- `CHANGELOG.md`
