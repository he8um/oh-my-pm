# Security Model

OH MY PM is designed with a conservative local-first security model. The rules
below are enforced by the repository's validation suite (`pnpm validate`), not
merely stated.

## Principles

- No secrets in repository files, examples, or fixtures.
- No telemetry, no cloud, no user accounts, no remote analytics.
- No hidden external writes.
- External context integrations are read-only.
- The analyzed project is never written.
- Local runtime data stays outside Git and outside the project.
- Diagnostics report the presence of a secret, never its value.

## The analyzed project is read-only

No CLI command and no MCP tool creates, modifies, or deletes a file in the
project being analyzed. Project documents are read through a single explicit
Node boundary that reads only: it never writes, never follows a symlinked
config, never searches parent directories, never executes project code, and
never leaves the resolved root.

## Application-data write boundary

Project Brain memory is the only thing OH MY PM writes, and it never lives
inside the analyzed project. Every managed path is confined below a resolved
application-data root that is separated from, and never nested with, the project
root — see [`project-memory/README.md`](../project-memory/README.md).

Writes are transactional (temp-then-rename, with the manifest rename as the
commit point) and lock-protected. Preview operations write nothing at all: no
data directory, no lock, no staging file.

Project-local _configuration_ — `oh-my-pm.config.json` — is committed by you and
read-only to OH MY PM. There is no `.oh-my-pm/` runtime directory inside a
project.

## External integrations

The GitHub provider is the only network surface, and it runs only when you
explicitly invoke it.

- `GET`-only requests to a fixed origin (`api.github.com`), with a fixed REST
  API version. The transport rejects any non-`GET` method.
- No GitHub mutation of any kind.
- The optional `OH_MY_PM_GITHUB_TOKEN` is read **only** from the environment,
  only at that boundary, and only when a token is not otherwise injected. It is
  never a CLI argument, never written to a config file, never logged, and never
  included in any output or error.
- `providers doctor` performs at most one read-only request, and only with an
  explicit `--confirm-network`.

## MCP surface

The MCP server exposes twelve read-only tools and **zero** write tools, over
stdio only. There is no HTTP transport, port, listener, authentication, or
session. `stdout` carries MCP protocol messages exclusively; warnings and fatal
errors go to `stderr`, so the protocol stream is never corrupted.

## Failure sanitization

Errors are structured values, not raw exceptions. A message may echo a
caller-supplied reference — the project root exactly as you typed it — but never
a resolved absolute path, document content, configuration text, an environment
value, or a token.

## Installation

The installer writes only under an explicit `--prefix`. It is preview-first,
requires `--apply` to write anything, replaces only its exact managed targets
under `--force`, downloads nothing, and never edits your PATH, shell profiles,
or MCP client configuration.

## Reporting issues

Do not include secrets, tokens, credentials, private project data, or logs
containing sensitive values in public issues. See [`SECURITY.md`](../SECURITY.md).
