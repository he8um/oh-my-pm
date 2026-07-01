# Compatibility

## Version compatibility

| Oh My PM version | Claude Code | Cursor | Codex | ChatGPT |
| --- | --- | --- | --- | --- |
| v0.1.0-alpha | ✅ | ✅ | ✅ | ✅ |

## Install contract stability

Before v1.0.0, the install contract may change between minor versions.

Always check the `CHANGELOG.md` before upgrading.

## Platform requirements

### Installers

- POSIX-compatible shell (sh, bash, zsh)
- macOS, Linux, or WSL on Windows
- No internet connection required

### Scripts

- `zip` command (for build-release.sh)
- `sha256sum` or `shasum` (for generate-checksums.sh)

### Agents

- Any Claude, Cursor, Codex, or ChatGPT version that supports the respective file format.

## Known limitations

- v0.1.0-alpha: starter content only; deep playbooks and examples are planned for later phases.
- MCP server alpha available in v0.7.0 — local context tools. GitHub Issues / Projects connector added in v0.8.0 — read-only, environment-variable configured. See `docs/github-connector.md`. ClickUp connector added in v0.9.0 — read-only, environment-variable configured. See `docs/clickup-connector.md`. Airtable connector added in v0.10.0 — read-only, environment-variable configured. See `docs/airtable-connector.md`.
- The install contract may change before v1.0.0.

## Related docs

- `upgrading.md`
- `VERSIONING.md`
- `CHANGELOG.md`
