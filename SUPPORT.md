# Support

OH MY PM is a local, read-only project intelligence system: a CLI and an MCP
server that analyze Markdown project documents and, only on explicit opt-in,
read-only GitHub context. It is installed from a release archive or from a
repository checkout; there is no registry package and no hosted service.

The supported release is the current published stable, `v0.5.1`. Questions about
earlier releases are answered by pointing at the current one: historical releases
stay published as immutable records but receive no fixes.

## Where to go

**GitHub Issues** — <https://github.com/he8um/oh-my-pm/issues> — is the support
channel. GitHub Discussions is not enabled for this repository.

Issues are the right place for:

- a reproducible bug in the CLI, the MCP server, or the installer;
- documentation that is wrong, missing, or contradicted by observed behavior;
- an architecture or security-model question;
- a narrowly scoped implementation proposal.

**Do not report a security vulnerability in a public issue.** Use private
vulnerability reporting instead — see [`SECURITY.md`](SECURITY.md).

## What to include in a bug report

A report that cannot be reproduced cannot be fixed. Please include:

- the version (`ohmypm --version`) and how it was installed (release archive or
  repository build);
- your operating system and Node.js version (`node --version`);
- the exact command you ran and its full output;
- what you expected instead;
- a minimal project fixture that reproduces it, if the behavior depends on
  document content.

Redact anything private. Never paste a token, a credential, or confidential
project content into an issue — the local-first design means your project data
never has to leave your machine for a problem to be diagnosed, and a pasted
secret is an exposure that outlives the issue.

## What this project does not offer

- **No guaranteed individual support.** This is a single-maintainer project with
  no service-level commitment. Issues are read and triaged as time allows, and
  some will be closed as out of scope.
- **No support for historical releases.** Fixes land on the supported line only.
- **No help with private forks or modified builds.** Reproduce the problem on a
  released artifact or on unmodified `main` first.
- **No product consulting.** Questions about how to run your projects, rather
  than how this tool behaves, are out of scope.

## Contributing versus support

Support is about behavior that seems wrong. Contribution is about changing the
code. If you intend to open a pull request, read
[`CONTRIBUTING.md`](CONTRIBUTING.md) first — it covers the quality gates
(`pnpm quality`), the validators, and the commit and review conventions a change
has to satisfy.
