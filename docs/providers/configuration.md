# Provider configuration

OH MY PM supports an optional, strictly read-only provider configuration file.
It improves GitHub CLI/MCP usability by supplying default values without storing
any secret and without weakening the fixed GitHub security boundary. Local,
offline Markdown workflows never read provider configuration.

> OH MY PM never creates or edits this file. You create and edit it yourself,
> outside OH MY PM. There is no `config init`, `config set`, or interactive
> wizard, and no command ever writes it.

## The file

The provider configuration is a single UTF-8 JSON file named `providers.json`:

```json
{
  "version": 1,
  "providers": {
    "github": {
      "enabled": true,
      "defaultRepository": "owner/repository",
      "defaultLimit": 50,
      "defaultSource": "overview",
      "defaultState": "open"
    }
  }
}
```

Schema rules:

- The root must be a JSON object with exactly `version` and an optional
  `providers` key.
- `version` must equal the integer `1`.
- `providers` may only contain `github`. The local provider is always enabled
  and is not user-configurable in this phase.
- The `github` object may only contain `enabled`, `defaultRepository`,
  `defaultLimit`, `defaultSource`, and `defaultState`.
  - `enabled` defaults to `true`.
  - `defaultRepository` is optional and must be a valid `owner/repository`
    identifier (the same strict parser the GitHub provider uses).
  - `defaultLimit` defaults to `50` and must be an integer from `1` through
    `100`.
  - `defaultSource` defaults to `overview` and must be one of `overview`,
    `repository`, `issues`, or `pull-requests`. The `item` and `search` sources
    require per-invocation data and are **not** valid defaults.
  - `defaultState` defaults to `open` and must be one of `open`, `closed`, or
    `all`.
- Unknown keys are rejected at every level.
- Any key containing a case-insensitive secret marker — `token`, `secret`,
  `password`, `authorization`, `cookie`, or `apiKey` — is rejected. **No secret
  value is ever permitted in provider configuration.**
- The API origin, API version, HTTP method, token environment-variable name,
  headers, timeouts, redirect policy, and custom hosts are all fixed and are
  **not** configurable.

## What stays fixed

These are never configurable and are never inferred from your file:

- Origin: `https://api.github.com`
- API version: `2026-03-10`
- Method: `GET` only (no write operations, no GraphQL)
- Token environment variable: `OH_MY_PM_GITHUB_TOKEN`

## Where the file is found

The location is resolved with this precedence (the first match wins):

1. An explicit `--provider-config <path>` CLI option.
2. A non-empty `OH_MY_PM_PROVIDER_CONFIG` environment variable.
3. POSIX: `$XDG_CONFIG_HOME/oh-my-pm/providers.json`.
4. POSIX: `~/.config/oh-my-pm/providers.json`.
5. Windows: `%APPDATA%\oh-my-pm\providers.json`.
6. Otherwise, resolved defaults with no file.

Rules:

- A relative explicit/environment path resolves against the current working
  directory.
- An absent default/OS-standard file is normal and resolves to defaults.
- An absent **explicit** or **environment** file is a controlled error, not a
  silent fallback.
- Parent directories are never searched, and the current project is never
  auto-discovered for provider configuration.
- A symlinked configuration file is rejected and never followed.
- The file must be a regular file no larger than 64 KiB, containing only UTF-8
  JSON (no comments, YAML, TOML, JSON5, or code).
- The loader never writes, never reaches the network, and never reads a token
  from the file.
- Public output shows a stable display path (`defaults`,
  `$OH_MY_PM_PROVIDER_CONFIG`, `$XDG_CONFIG_HOME/oh-my-pm/providers.json`,
  `~/.config/oh-my-pm/providers.json`, `%APPDATA%\oh-my-pm\providers.json`, or
  the path you supplied). It never exposes a resolved absolute home path.

Example POSIX path:

```text
~/.config/oh-my-pm/providers.json
```

Example Windows path:

```text
%APPDATA%\oh-my-pm\providers.json
```

## How defaults are applied

Provider configuration supplies **defaults** that explicit CLI/MCP values always
override:

```text
repository: explicit CLI/MCP value > providers.github.defaultRepository > error
limit:      explicit CLI/MCP value > providers.github.defaultLimit      > 50
source:     explicit CLI/MCP value > providers.github.defaultSource     > overview
state:      explicit CLI/MCP value > providers.github.defaultState      > open
```

The configured `defaultSource`/`defaultState` feed the GitHub source-selection
model; `item` and `search` are always per-invocation and never stored. See
[GitHub source selection](./github-source-selection.md).

A disabled GitHub provider (`"enabled": false`) blocks a GitHub workflow before
any transport is constructed. An invalid explicit repository or limit fails
without falling back to configuration.

With a configured default repository and limit you can run:

```bash
oh-my-pm github risks --markdown
```

Explicit values still win:

```bash
oh-my-pm github next another-owner/another-repo --limit 25 --markdown
```

## Local vs provider configuration

Provider configuration (`providers.json`) is a separate system from local
project configuration (`oh-my-pm.config.json`). Local commands
(`status`, `doctor`, `plan`, `brief`, `risks`, `next`, `handoff`,
`install-preview`) never read provider configuration, never read the GitHub
token, and never touch the network. Local `--provider-config` is rejected.

## Tokens stay out of configuration

Authentication remains process-boundary-only through the optional
`OH_MY_PM_GITHUB_TOKEN` environment variable. It is never stored in
configuration, never printed, and never required for public repositories. See
[GitHub read-only provider](./github.md).
