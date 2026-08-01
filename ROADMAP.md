# Roadmap

The detailed public roadmap is maintained in [`docs/roadmap.md`](docs/roadmap.md).

Work is labelled with one of five states: **Shipped**, **Prepared but
unpublished**, **Active maintenance**, **Planned**, or **Out of scope**.

## Active maintenance — v0.5.1

**Documentation truth and the application boundary.** A patch release with no
public behavior change.

It corrects active documentation that no longer matched the shipped product, and
introduces `@oh-my-pm/application` so the CLI and MCP server become presentation
adapters over the same use cases. The MCP server no longer depends on the CLI.

No new command, no changed CLI syntax or JSON output, no changed MCP tool or
schema, no Project Brain schema change, no Project Memory format change, no
migration, and no Dashboard. See [`docs/v0.5/v0.5.1-scope.md`](docs/v0.5/v0.5.1-scope.md)
and [`docs/v0.5/application-boundary.md`](docs/v0.5/application-boundary.md).

## Prepared but unpublished — v0.5.0

**CLI command namespace.** `ohmypm`, `ohmypm-mcp` and `ohmypm-install` are the
canonical commands, with the former `oh-my-pm` family retained as deprecated
compatibility aliases and no removal scheduled. Not a product rename: package
scope, environment variables, installation paths, data directories, archive
names and the MCP server key are unchanged, and no data migration is required.

The v0.5.0 work merged to `main` but was **never published** — no `v0.5.0` tag or
GitHub release exists. It is superseded by v0.5.1, which would be the first
published stable of the v0.5 line. See [`docs/v0.5/README.md`](docs/v0.5/README.md).

## Shipped

- **v0.4 Project Timeline** — a local, bounded, deterministic history of project
  changes derived from already-captured Project Brain snapshots, exposed
  read-only through `ohmypm memory timeline` and the `project_timeline` MCP
  tool. See [`docs/v0.4/README.md`](docs/v0.4/README.md).
- **v0.3 Project Brain and Project Memory** — local capture, comparison, and the
  `memory` command namespace, with the local persistence adapter.
- **v0.2 GitHub provider and release lifecycle** — read-only GitHub workflows,
  provider diagnostics, deterministic archives, and the preview-first installer.
- **v0.1 foundation** — public foundation, repository structure, shared
  contracts, the Rust/WASM Kernel, Runtime, the CLI surface, the read-only
  context provider framework, and the validation and release lifecycle.

The latest **published** stable release is
[`v0.4.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.4.0).

## Planned — v0.6

**Local Project Dashboard.** A local read-only view over the same application
use cases. Nothing about it is designed or implemented yet; v0.5.1 only
establishes the boundary it would consume.

## Out of scope

Cloud sync, user accounts, telemetry, remote analytics, GitHub mutation, an HTTP
MCP transport, and npm registry publication.
