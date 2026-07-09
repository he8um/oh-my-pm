# Security Policy

## Supported versions

OH MY PM is in early development. No stable release is supported yet.

## Reporting a vulnerability

Do not include secrets, tokens, credentials, private project data, or sensitive logs in public issues.

If private reporting is available, use it. If not, open a minimal public issue describing the category of the concern without sensitive details.

## Security expectations

- No secrets in commits, examples, fixtures, logs, or issues.
- Local runtime data must stay out of Git.
- External integrations are expected to be read-only by default.
- Diagnostics must not print secret values.
