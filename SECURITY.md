# Security Policy

## Supported versions

| Release line | Status                                                           |
| ------------ | ---------------------------------------------------------------- |
| `v0.5.x`     | **Supported.** `v0.5.3` is the current published stable release. |
| `v0.4.x`     | Not supported. Preserved as an immutable historical release.     |
| `v0.3.x`     | Not supported. Preserved as an immutable historical release.     |
| `v0.2.x`     | Not supported. Preserved as an immutable historical release.     |
| `v0.1.x`     | Not supported. Preserved as an immutable historical release.     |

`v0.5.1` remains published and immutable, but it is superseded: the supported
artifact on the `v0.5.x` line is `v0.5.3`.

Security fixes are made only on the supported line and are delivered by
publishing a new release on it. Earlier releases stay published as immutable
records and are never amended in place, so a fix never appears inside an
already-published archive — upgrading is the only way to receive one.

The current `main` is **not** a substitute for a stable security release. It may
carry a fix before that fix has been published, but it is not a supported
artifact and has not passed release qualification; only a published release has.

## Reporting a vulnerability

**Report privately. Do not open a public issue for a suspected vulnerability**,
and do not describe it in a pull request or a commit message before it has been
reviewed — a public report tells everyone running the affected version at the
same moment it tells the maintainer.

Use GitHub's private vulnerability reporting for this repository:

- **Security → Report a vulnerability**, or
- <https://github.com/he8um/oh-my-pm/security/advisories/new>

A report submitted that way is visible only to the maintainer.

There is no security mailing address for this project. If private reporting is
unavailable to you, open a public issue that says only that you have a security
concern and asks for a private channel — with **no** technical detail, no
reproduction, and no affected version.

### What to include

- the affected version (`ohmypm --version`) and release line, or the exact commit;
- your platform and Node.js version;
- what an attacker gains — the security consequence, not only the misbehavior;
- minimal reproduction steps, with a redacted fixture project if one is needed;
- the observed behavior and the expected behavior.

**Never include a real token, credential, private project content, or an
unredacted log.** A report carrying a live credential is itself an exposure;
rotate the credential rather than sending it.

### What to expect

This project has a single maintainer, so no response-time commitment is offered
— a promised deadline that cannot be honored is worse than none. Reports are
reviewed as soon as reasonably possible, and each receives a decision: fix,
mitigate, or an explanation of why the behavior is intended. You will be told
which, and credited in the advisory if you would like to be.

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
  items), no GraphQL, no write-back. Provider-owned repository/state/kind scope
  is injected into search queries and can never be overridden by user search
  terms.
- The `item` source may optionally include ordinary issue/PR conversation
  comments (`--include-comments` / `includeComments`), disabled by default. This
  adds a single extra `GET .../issues/{number}/comments` (one page, at most 50).
  Comment bodies are bounded and never exposed through the MCP projection.
- A pull-request `item` may optionally include bounded review submissions
  (`--include-reviews` / `includeReviews`) and inline review comments
  (`--include-review-comments` / `includeReviewComments`), disabled by default
  and only when the selected item is a pull request. Each adds a single extra
  `GET .../pulls/{number}/reviews` or `GET .../pulls/{number}/comments` (one
  page, at most 20). Timeline events, thread resolution, reactions, diffs,
  files, and commits are never fetched; review and review-comment bodies, diff
  hunks, and commit ids are never exposed through the MCP projection. An issue
  selected with review options fails with a sanitized error after exactly one
  item-identification request.

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
  `defaultLimit`, `defaultSource`, and `defaultState` are user-configurable.
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
