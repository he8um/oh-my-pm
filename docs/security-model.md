# Security Model

OH MY PM is designed with a conservative local-first security model.

## Principles

- No secrets in repository files.
- No telemetry by default.
- No hidden external writes.
- External context integrations are read-only by default.
- Local runtime data stays outside Git.
- Diagnostics must not print secret values.

## Local data

Project-local runtime data should live in ignored local folders such as `.oh-my-pm/`.

## External integrations

External integrations must be explicit, user-controlled, and read-only unless a future reviewed security model allows otherwise.

## Reporting issues

Do not include secrets, tokens, credentials, private project data, or logs containing sensitive values in public issues.
