# Provider diagnostics

OH MY PM ships offline-first provider diagnostics for the local and GitHub
providers. They inspect resolved provider state and validate configuration
without network access; a single, explicitly confirmed GitHub request is the
only way any network is touched.

There are two distinct doctors:

```text
oh-my-pm doctor
- Runtime/Kernel foundation diagnostics
- offline
- no config/token/provider access

oh-my-pm providers doctor
- process/provider configuration diagnostics
- offline by default
- optional explicit GitHub network check
```

`oh-my-pm doctor` is unchanged and remains Kernel-focused and provider-agnostic.

## `providers status`

Inspect the resolved provider state without any network access:

```bash
oh-my-pm providers status --markdown
```

It reports the configuration source/existence/validity, each provider's
read-only network posture and state, the configured GitHub defaults, and GitHub
token presence only. It never contacts the network. It exits `0` for valid
configuration and `2` for an invalid or unreadable explicit/environment
configuration.

## `providers doctor` (offline)

Run all offline checks with no network access:

```bash
oh-my-pm providers doctor --markdown
```

The checks run in a fixed, deterministic order:

```text
config.load
config.schema
provider.local.enabled
provider.local.offline
provider.github.enabled
provider.github.repository
provider.github.limit
provider.github.origin
provider.github.api-version
provider.github.method
provider.github.token
runtime.node-version
runtime.kernel
```

The GitHub fixed-boundary checks assert the pinned values (origin
`https://api.github.com`, API version `2026-03-10`, `GET`-only, no custom
origin, no write operations) — never inferred from your configuration. Token
absence is reported as `info`, not a failure, because public repositories may
work unauthenticated. It exits `0` when no check fails and `2` when a
config/provider check fails.

## `providers doctor github` (explicit network)

To verify GitHub connectivity and access, opt in explicitly with
`--confirm-network`:

```bash
oh-my-pm providers doctor github he8um/oh-my-pm \
  --confirm-network \
  --markdown
```

or, relying on a configured default repository:

```bash
oh-my-pm providers doctor github \
  --confirm-network \
  --markdown
```

Behavior:

- The offline checks run first, always.
- Only then, and only with `--confirm-network`, does it perform **exactly one**
  read-only repository-metadata `GET` request. It never fetches issues or pull
  requests, never calls `/rate_limit`, never retries, and never measures
  latency.
- Exit `0` on successful access, `2` on a controlled provider failure, and `1`
  only on an unexpected internal failure.

Provider failures keep the stable taxonomy: `OMP-P-4004` (authentication),
`OMP-P-4005` (forbidden), `OMP-P-4006` (not found), `OMP-P-4007` (rate limited),
and `OMP-P-4008` (transport).

## What diagnostics never reveal

Diagnostic reports never contain a token value (only `present`/`absent`), an
absolute config path, raw configuration text, a raw provider response, a
repository description/body, response headers, timestamps, durations, hostnames,
or usernames.

## MCP diagnostics tools

The MCP server exposes two diagnostics tools after its eight workflow tools:

- `provider_status` — takes no input, resolves configuration from the process
  environment or standard OS location (an agent cannot supply a config path),
  reports token presence only, and never accesses the network.
- `github_provider_diagnostics` — accepts an optional `repository` (the
  configured default may be used) and an optional `confirmNetwork` (defaults to
  `false`). With `confirmNetwork: false` it returns offline GitHub diagnostics
  only; with `confirmNetwork: true` it performs exactly one read-only `GET`
  repository-metadata request. There is no token, config-path, API-URL, limit,
  or header input.

Server startup and `tools/list` remain network-free.
