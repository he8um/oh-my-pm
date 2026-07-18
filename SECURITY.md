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
- Source selection (`overview`, `repository`, `issues`, `pull-requests`, `item`,
  `search`) stays inside this boundary: `GET`-only, a single API page (max 100
  items), no GraphQL, no comments/timelines/diffs/files, and no write-back.
  Provider-owned repository/state/kind scope is injected into search queries and
  can never be overridden by user search terms.

## Provider configuration and diagnostics

Provider configuration (`providers.json`, see
[docs/providers/configuration.md](docs/providers/configuration.md)) and
diagnostics (see [docs/providers/diagnostics.md](docs/providers/diagnostics.md))
follow these rules:

- Provider configuration is strictly read-only. OH MY PM never creates or edits
  it; there is no `config init`, `config set`, or interactive wizard, and no
  command writes it.
- No secret value is ever permitted in configuration. Any key containing a
  case-insensitive secret marker (`token`, `secret`, `password`,
  `authorization`, `cookie`, `apiKey`) is rejected. The token stays in
  `OH_MY_PM_GITHUB_TOKEN`.
- The API origin, API version, HTTP method, and token environment-variable name
  are fixed and are not configurable; only GitHub `enabled`, `defaultRepository`,
  and `defaultLimit` are user-configurable.
- The configuration loader never writes, never reaches the network, never reads
  a token, never follows a symlinked config, never searches parent directories,
  and never returns raw file text or a resolved absolute path.
- `providers status` and offline `providers doctor` make no network request.
  The GitHub network diagnostic runs only with the explicit `--confirm-network`
  flag (`confirmNetwork: true` in MCP) and performs exactly one read-only `GET`
  repository-metadata request.
- Diagnostics never reveal a token value, a raw provider response, response
  headers, an absolute config path, or raw configuration text. MCP agents cannot
  supply an arbitrary config path.
- Local commands never read provider configuration or the token.
