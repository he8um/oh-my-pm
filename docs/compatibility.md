# Compatibility

## Version compatibility

| Oh My PM version | Claude Code | Cursor | Codex | ChatGPT | MCP |
| --- | --- | --- | --- | --- | --- |
| v0.1.0-alpha – v0.6.0 | ✅ | ✅ | ✅ | ✅ | — |
| v0.7.0 – v0.13.0 | ✅ | ✅ | ✅ | ✅ | ✅ (read-only alpha) |
| v1.0.0 | ✅ | ✅ | ✅ | ✅ | ✅ (read-only, stable) |

Pack-based install (Claude Code, Cursor, Codex, ChatGPT) has been supported
since v0.1.0-alpha and has not changed its compatibility surface across
releases. MCP support (`packages/mcp-server/`) is additive and optional,
starting at v0.7.0 — it does not affect pack-based compatibility.

## Install contract stability

The install contract is stable as of v1.0.0.

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

- v0.1.0-alpha: starter content only; deep playbooks and examples were added in later phases.
- MCP server alpha available starting in v0.7.0 — local context tools. GitHub Issues / Projects connector added in v0.8.0 — read-only, environment-variable configured. See `docs/github-connector.md`. ClickUp connector added in v0.9.0 — read-only, environment-variable configured. See `docs/clickup-connector.md`. Airtable connector added in v0.10.0 — read-only, environment-variable configured. See `docs/airtable-connector.md`. Linear connector added in v0.11.0 — read-only, environment-variable configured. See `docs/linear-connector.md`. Jira connector added in v0.12.0 — read-only, environment-variable configured. See `docs/jira-connector.md`. Notion connector added in v0.13.0 — read-only, environment-variable configured. See `docs/notion-connector.md`. This completes the connector set shipped as of v1.0.0.

## Related docs

- `upgrading.md`
- `VERSIONING.md`
- `CHANGELOG.md`
