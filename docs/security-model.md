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
- Installers support `--self-test` to verify preconditions without modifying files.
- All installer scripts use `set -eu` for a safe shell baseline.
- Generated release assets (`dist/*.zip`) are not committed to the repository.

## Release asset safety

- Release zip files are generated from source. They are not pre-built binaries.
- All release assets include a `checksums.txt` with SHA-256 hashes.
- Verify downloads using the published checksums before installing.

## What is not included

- No secrets, tokens, API keys, or credentials.
- No private company data or internal references.
- No realistic-looking secret examples that could be confused with real credentials.
- No Digikala or private company references.

## MCP security

The MCP server (`packages/mcp-server/`, shipped starting at v0.7.0) follows
this security model:

**Credentials:** No credentials in the repository. Connector tokens are provided via environment variables at runtime only. No credentials appear in logs, error messages, or tool responses.

**Read-only default:** The MCP server is read-only. No connector — GitHub, ClickUp, Airtable, Linear, Jira, or Notion — supports write actions. Write actions would require explicit user confirmation and per-action policy review before any connector enables them.

**Connector allowlist:** Only connectors explicitly configured by the user are accessible. The server does not attempt to connect to any unconfigured system.

**No telemetry:** The MCP server collects no telemetry, sends no usage data, and makes no background network calls without a user-initiated tool call.

**No broad scans:** The MCP server does not scan the entire repository by default. Sensitive file patterns (`.env`, `*.key`, `*.pem`) are excluded from any automatic scan.

**Failure-safe:** If a connector is unavailable, the agent continues without that data. The server returns a structured error; the agent does not abort.

See `docs/mcp-security-policy.md` for the full MCP security policy.

## Reporting security issues

See `SECURITY.md`.
