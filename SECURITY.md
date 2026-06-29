# Security

## Security model

Oh My PM is a local agent kit. It does not make network calls, collect telemetry, or transmit data.

- Installers run locally and copy files only.
- No credentials, tokens, or API keys are required or stored.
- No external dependencies are fetched at install time.
- No private data is included in any release asset.

## What to report

If you discover a security issue — such as a secret accidentally included, an unsafe installer pattern, or a script that could be misused — please report it responsibly.

## Reporting

Open a GitHub issue marked as `security` or contact the maintainer directly via the repository.

Do not include sensitive reproduction details in a public issue. Describe the type of issue and we will follow up.

## Scope

Oh My PM does not operate infrastructure. Security concerns are primarily:

- Installer safety (overwrite behavior, path traversal)
- Accidental inclusion of secrets in release assets
- Script injection risks in shell scripts

## Known limitations

See the release `validation-report.md` for any known limitations at each version.
