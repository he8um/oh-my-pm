# Roadmap

The detailed public roadmap is maintained in [`docs/roadmap.md`](docs/roadmap.md).

Work is labelled with one of five states: **Shipped**, **Prepared but
unpublished**, **Active maintenance**, **Planned**, or **Out of scope**.

## Shipped — v0.5.3

**Documentation and architecture truth.** A patch release with no product code
change and no public behavior change, superseded as latest stable by `v0.5.4`.

`docs/manifest.json` becomes the authoritative, machine-readable record of
documentation authority — `status`, `authority`, `appliesTo`, `replacement`, and
the `concern` each document is authoritative about. `pnpm validate:docs` derives
its active and historical sets from that manifest instead of restating them, and
gains guards for active claims about nonexistent packages, real packages omitted
from the authoritative package map, superseded documents still linked as
normative, and duplicate authoritative documents for one concern. Every tracked
document must now be classified or explicitly excluded, so a new document cannot
default to unchecked. `pnpm docs:inventory` reports the classification
deterministically and offline.

Two genuine active-documentation errors are corrected: the README described the
repository as a "new v2 line" (it ships `v0.x`, with no `v2.x` target), and the
architecture package map omitted the real `@oh-my-pm/examples` package. Historical
and release records are preserved unedited — the changelog is classified as a
release record precisely so its accurate past claims are not rewritten. See
[`docs/releases/v0.5.3.md`](docs/releases/v0.5.3.md) and the
[post-publication validation record](docs/releases/v0.5.3-post-publication-validation.md).

## Shipped — v0.5.2

**The shared GitHub application boundary.** A patch release with no public
behavior change, superseded as latest stable by `v0.5.3`.

The GitHub-backed project workflow is composed once in
`@oh-my-pm/application`, so the CLI and MCP surfaces consume the same
application use case instead of each rebuilding the Runtime pipeline. Node
configuration, token, transport, and clock composition move behind the
application Node boundary, and the stale independent MCP GitHub runtime version
is removed.

No new command, no changed CLI syntax or JSON output, no changed MCP tool,
schema, annotation or tool order, no Project Brain schema change, no Project
Memory format change, no migration, and no Dashboard. See
[`docs/releases/v0.5.2.md`](docs/releases/v0.5.2.md).

The v0.5.2 maintenance scope is complete: documentation and governance truth
(#30), CI and quality policy (#32), and CODEOWNERS and hosted protections (#33)
are all closed. See the
[post-publication validation record](docs/releases/v0.5.2-post-publication-validation.md).

## Shipped — v0.5.1

**Documentation truth and the application boundary.** A patch release with no
public behavior change, and the **first published stable of the v0.5 line**.

It corrected active documentation that no longer matched the shipped product, and
introduced `@oh-my-pm/application` so the CLI and MCP server become presentation
adapters over the same use cases. The MCP server no longer depends on the CLI.
See [`docs/v0.5/v0.5.1-scope.md`](docs/v0.5/v0.5.1-scope.md) and
[`docs/v0.5/application-boundary.md`](docs/v0.5/application-boundary.md).

## Prepared but unpublished — v0.5.0

**CLI command namespace.** `ohmypm`, `ohmypm-mcp` and `ohmypm-install` are the
canonical commands, with the former `oh-my-pm` family retained as deprecated
compatibility aliases and no removal scheduled. Not a product rename: package
scope, environment variables, installation paths, data directories, archive
names and the MCP server key are unchanged, and no data migration is required.

The v0.5.0 work merged to `main` but was **never published** — no `v0.5.0` tag or
GitHub release exists. It is superseded by v0.5.1, the first published stable of
the v0.5 line. See [`docs/v0.5/README.md`](docs/v0.5/README.md).

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
[`v0.5.4`](https://github.com/he8um/oh-my-pm/releases/tag/v0.5.4).

## Shipped — v0.5.4

**Contract and repository consistency.** A patch release with no public behavior
change, **published as the latest stable release**.

`packages.json` becomes the authoritative package catalog — one role per
workspace, explicit dependency allowances and forbidden inversions, permitted
process side effects, and release-bundle status — and `pnpm validate:packages`
derives the boundary checks from it, so a package added later inherits them.
`ApplicationResult<T>` with normalized source descriptors, provenance records, and
a unified `Diagnostic` join the application boundary, alongside a repository-wide
error taxonomy that classifies the existing public failure codes and maps them to
the CLI exit codes the CLI already returns and to the MCP error shape. Direct
CLI-vs-MCP semantic parity assertions cover the shared workflows.

The audit found the dependency graph already acyclic, no deep `src/` imports,
`@oh-my-pm/contracts` already pure, and the exit codes already consistent — those
are locked in, not repaired. The CLI's separate local Runtime composition for
`status`, `doctor`, and `plan` is documented as intentional rather than changed.
See [`docs/releases/v0.5.4.md`](docs/releases/v0.5.4.md) and
[`docs/v0.5/contracts.md`](docs/v0.5/contracts.md).

## Planned — v0.6

**Core and public-surface work.** The candidate scope is the canonical command
migration (making `omp` canonical while keeping compatibility aliases) and
whatever public-surface consolidation the v0.5.4 contracts enable. Nothing here
is committed or implemented, and v0.5.3 and v0.5.4 deliberately do **not** begin
it: `ohmypm` remains the canonical command.

## Future — beyond v0.6

**Local Project Dashboard.** A local read-only view over the same application
use cases. Nothing about it is designed or implemented, and no release in the
v0.5 line contains any part of it; the v0.5 patches only establish the boundary
it would consume.

## Out of scope

Cloud sync, user accounts, telemetry, remote analytics, GitHub mutation, an HTTP
MCP transport, and npm registry publication.
