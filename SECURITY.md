# Security Policy

## Supported versions

OH MY PM is in early development. No stable release is supported yet.

## Reporting a vulnerability

Do not include secrets, tokens, credentials, private project data, or sensitive logs in public issues.

If private reporting is available, use it. If not, open a minimal public issue describing the category of the concern without sensitive details.

## Security expectations

- No secrets in commits, examples, fixtures, logs, or issues.
- Local runtime data must stay out of Git.
- External integrations are read-only. Network access is off by default and
  opt-in: only the explicit `github` command/tool reaches the network, and only
  as `GET`-only requests to the fixed `api.github.com` origin.
- Diagnostics must not print secret values.

## GitHub provider

The read-only GitHub provider (see [docs/providers/github.md](docs/providers/github.md))
follows these rules:

- Requests are `GET`-only against `https://api.github.com` (REST API version
  `2026-03-10`). There are no write operations, no non-GET requests, and no
  GraphQL.
- Authentication is optional and supplied only through the
  `OH_MY_PM_GITHUB_TOKEN` environment variable. There is no `--token` CLI
  argument.
- The token is never persisted and never appears in errors, JSON, MCP output,
  logs, snapshots, or reports. The provider package never reads the environment;
  the token is injected at the process boundary.
- No network request is made at process startup or during MCP tool discovery.
- Local Markdown project workflows remain fully offline and read no token.
