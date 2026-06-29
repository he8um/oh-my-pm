# Security Model

## Summary

Oh My PM is a local agent kit. It makes no network calls, collects no telemetry, and stores no credentials.

## Installer safety

- Installers copy files locally only.
- No files are downloaded from the internet.
- No `curl | bash` pattern is used or recommended.
- No credentials are required.
- Installers do not overwrite files by default. Use `--force` to replace.
- Installers support `--dry-run` to preview changes before applying them.
- Installers support `--backup` to create a timestamped backup before replacing.

## Release asset safety

- Release zip files are generated from source. They are not pre-built binaries.
- All release assets include a `checksums.txt` with SHA-256 hashes.
- Verify downloads using the published checksums before installing.

## What is not included

- No secrets, tokens, API keys, or credentials.
- No private company data or internal references.
- No realistic-looking secret examples that could be confused with real credentials.
- No Digikala or private company references.

## Reporting security issues

See `SECURITY.md`.
