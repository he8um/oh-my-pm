# OH MY PM

**OH MY PM** is a local project intelligence system for structured project and product delivery.
<p align="center">
  <img
    src="./assets/readme/oh-my-pm-hero.png"
    alt="OH MY PM — AI-ready project and product management toolkit"
    width="100%"
  />
</p>
It is designed for teams that want clearer delivery context, safer execution boundaries, and repeatable validation around project work.

> **Latest stable release:** [`v0.5.3`](https://github.com/he8um/oh-my-pm/releases/tag/v0.5.3)
> **Source version:** `0.5.3` (published)
>
> [`v0.5.3`](https://github.com/he8um/oh-my-pm/releases/tag/v0.5.3) is a preserved stable release, a **documentation and architecture truth** patch with no product code change and no public behavior change: `docs/manifest.json` becomes the authoritative machine-readable record of documentation authority, `pnpm validate:docs` derives its active and historical document sets from that manifest and gains guards for nonexistent-package claims, packages omitted from the authoritative package map, superseded documents linked as normative, and duplicate authoritative documents, and `pnpm docs:inventory` reports the classification offline. It corrects two real errors: this README's former claim to be a "new v2 line", and the omission of `@oh-my-pm/examples` from the architecture package map. See the [v0.5.3 release notes](docs/releases/v0.5.3.md) and the [post-publication validation record](docs/releases/v0.5.3-post-publication-validation.md).
>
> [`v0.5.2`](https://github.com/he8um/oh-my-pm/releases/tag/v0.5.2) is a preserved stable release, a **maintenance release** whose scope is centralizing the GitHub-backed project workflow in `@oh-my-pm/application`, so the CLI and MCP surfaces consume the same application use case instead of each rebuilding the Runtime pipeline. It changes **no** public behavior: no new command, no changed CLI syntax or JSON output, no changed MCP tool, schema, annotation or tool order, no Project Brain schema change, no Project Memory format change, and **no migration** from v0.5.1. It includes no Dashboard. See the [v0.5.2 release notes](docs/releases/v0.5.2.md) and the [post-publication validation record](docs/releases/v0.5.2-post-publication-validation.md).
>
> [`v0.5.1`](https://github.com/he8um/oh-my-pm/releases/tag/v0.5.1) is a preserved stable release and the **first published stable of the v0.5 line**. It corrected active documentation and introduced `@oh-my-pm/application` as the shared application boundary, so the CLI and MCP server became presentation adapters over the same use cases, with no public behavior change. See the [v0.5.1 release notes](docs/releases/v0.5.1.md), the [v0.5.1 scope](docs/v0.5/v0.5.1-scope.md), and [the application boundary](docs/v0.5/application-boundary.md).
>
> **`v0.5.0` was never published.** It was merged to `main` as a source candidate and is superseded by `v0.5.1`; no `v0.5.0` tag or GitHub release exists. v0.5.0 introduced the **CLI command namespace migration**: it made `ohmypm`, `ohmypm-mcp` and `ohmypm-install` canonical, with the former `oh-my-pm` family retained as deprecated compatibility aliases. v0.6.0 continues that migration — `omp`, `omp-mcp` and `omp-install` are now canonical and the `ohmypm*` family is a supported compatibility alias. Neither is a product rename: the package scope, environment variables, installation paths, data directories, release archive names and MCP server key are all unchanged. See the [v0.6 migration guide](docs/v0.6/README.md).
>
> [`v0.4.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.4.0) is a preserved stable release, adding **Project Timeline**: a local, bounded, deterministic history of project changes derived read-only from already-captured Project Brain snapshots, exposed through `omp memory timeline` and the `project_timeline` MCP tool. See the [v0.4.0 release notes](docs/releases/v0.4.0.md) and the [v0.4 architecture](docs/v0.4/README.md).
>
> [`v0.3.1`](https://github.com/he8um/oh-my-pm/releases/tag/v0.3.1) is a preserved stable release — a CLI usability patch over `v0.3.0` (conventional `--help`, installed `mcp-config`) with no schema, store-format, or MCP capability change. [`v0.3.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.3.0) remains a preserved immutable stable release targeting `0d6f9b1…`. [`v0.3.0-rc.1`](https://github.com/he8um/oh-my-pm/releases/tag/v0.3.0-rc.1) is a published **prerelease** (the v0.3 Project Brain line; not marked latest), targeting `1db4057…`. [`v0.2.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.2.0), [`v0.2.0-rc.1`](https://github.com/he8um/oh-my-pm/releases/tag/v0.2.0-rc.1) and [`v0.1.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.1.0) remain preserved historical releases. Node.js 20+ is the only runtime requirement for installed archives. Packages remain private; there is no npm package.

---

## What this repository is

This repository is the current implementation of OH MY PM. Its release line is `v0.x`: the published stable releases run from [`v0.1.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.1.0) through [`v0.6.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.6.0), and the source version is recorded in [`version.json`](version.json) — currently `0.6.1`, which is prepared but not yet published.

It began as a clean rebuild with a new architecture, replacing an earlier prototype line that is no longer developed here. That rebuild is history, not a pending migration: there is no `v2.x` target, and the versions above are the only release line this repository ships. See [the roadmap](ROADMAP.md) for what is planned next.

---

## Product direction

OH MY PM focuses on one practical delivery problem:

> Given a project, what should be done next, what context matters, what boundaries apply, and how should the result be validated?

The project is local-first, validation-first, and designed to keep project execution explicit instead of relying on scattered notes, undocumented assumptions, or manual coordination.

---

## Architecture

The implemented architecture is organized around these parts:

| Area              | Responsibility                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| Contracts         | Generated TypeScript and Rust types shared by every layer                            |
| Kernel            | Pure Rust/WASM control plane for validation, state, feature flags, and update safety |
| Application       | Shared use cases consumed by every presentation surface                              |
| Runtime           | Request orchestration and execution flow                                             |
| Planner           | Task planning and dependency shaping                                                 |
| Context Providers | Read-only project context integrations                                               |
| Skills            | Deterministic project-management transformations                                     |
| Project Memory    | Local application-state write boundary for Project Brain records                     |
| CLI               | Command-line presentation adapter                                                    |
| MCP server        | Read-only stdio Model Context Protocol adapter                                       |
| Installer         | Local installation and update lifecycle                                              |
| Validation        | Structure, boundary, documentation, fixture, and release checks                      |
| Release Lifecycle | Controlled release state transitions                                                 |

CLI and MCP are presentation adapters over the same application use cases:

```text
CLI ───────────┐
MCP ───────────┼──> Application ──> Runtime / Providers / Project Memory
Future UI ─────┘                    └──> Planner / Skills / Kernel
```

The future UI line is architectural context only; this release includes no
Dashboard. See [`docs/architecture.md`](docs/architecture.md) and
[the application boundary](docs/v0.5/application-boundary.md).

---

## First usable local workflow

After building the workspace, OH MY PM can read Markdown documents from a local project directory and generate a project status brief, a project risk report, a next-task list, or a full project handoff:

```bash
node cli/bin/omp.mjs brief ./examples/fixtures/markdown-project --markdown
node cli/bin/omp.mjs risks ./examples/fixtures/markdown-project --markdown
node cli/bin/omp.mjs next ./examples/fixtures/markdown-project --markdown
node cli/bin/omp.mjs handoff ./examples/fixtures/markdown-project --markdown
```

`brief` gives a local project overview from document-level project status. `risks` reports deterministic, line-level risk signals from recognized Markdown risk headings and explicit markers (English and Persian) — each risk is the actual risk line, never a document-title collapse. `next` derives next tasks from unchecked Markdown checklists, list items under recognized action headings, and explicit action markers, stripping any priority marker. `handoff` assembles a project's objective, active work, open tasks, risks, milestones, and decisions from deterministic Markdown sections into a titled handoff with a fixed Summary / Open Tasks / Risks / Decisions layout. Every workflow is read-only and local-only: no context is uploaded, no project file is modified, and no external integration or LLM is required.

Risk and next-task extraction is deterministic and rule-based — no LLM, embedding, or fuzzy scorer. It reads exact English and Persian headings/markers, excludes checked (resolved) items and fenced code, and applies false-positive guards (for example `unblocked` is not `blocked`). The same extraction runs over GitHub issues and pull requests through the `github` command, using exact label and status rules, overdue inference, and one risk/task per item. See [the deterministic extraction guide](docs/deterministic-extraction.md).

## GitHub read-only workflows

The same four workflows can run against a GitHub repository through the explicit
`github` command. This is the one part of OH MY PM that reaches the network, and
only when you invoke it:

```bash
# Public repository (no token needed):
omp github brief owner/repository --markdown

# Private repository or higher rate limit:
export OH_MY_PM_GITHUB_TOKEN="<fine-grained read-only token>"
omp github brief owner/private-repository --limit 50 --markdown
```

The GitHub provider is strictly read-only: `GET`-only requests to a fixed origin
(`api.github.com`, REST API version `2026-03-10`) for repository metadata, issues,
and pull requests. It never writes to GitHub, never uses a token CLI argument,
and never prints or persists the optional `OH_MY_PM_GITHUB_TOKEN`. See
[the GitHub provider guide](docs/providers/github.md).

`--source` selects exactly which context is analyzed — `overview` (default),
`repository`, `issues`, `pull-requests`, one `item` by `--number`, or a
repository-scoped `search` by `--query` — with `--state open|closed|all` and
search `--kind`. The `item` source can optionally include a single issue/PR's
ordinary conversation comments with `--include-comments` (opt-in, disabled by
default) and `--comment-limit`; see
[GitHub item comments](docs/providers/github-item-comments.md). A pull-request
`item` can additionally include bounded review submissions
(`--include-reviews` / `--review-limit`) and inline review comments
(`--include-review-comments` / `--review-comment-limit`), disabled by default
and only when the selected item is a pull request; see
[GitHub pull-request reviews](docs/providers/github-pr-reviews.md). See also
[GitHub source selection](docs/providers/github-source-selection.md):

```bash
omp github risks owner/repository --source issues --state open --markdown
omp github brief owner/repository --source item --number 123 --markdown
omp github risks owner/repository --source item --number 123 --include-comments --comment-limit 20 --markdown
omp github risks owner/repository --source item --number 123 --include-reviews --review-limit 10 --include-review-comments --review-comment-limit 10 --markdown
omp github risks owner/repository --source search --query "release blocker" --markdown
```

Scope at a glance:

```text
Local Markdown workflows:
- offline
- no network
- no token

GitHub workflows:
- explicit `github` command/tool only
- outbound read-only HTTPS to api.github.com
- optional token
```

The current next-task workflow extracts explicit unchecked Markdown checklist items. It does not generate tasks from arbitrary prose.

## Getting started locally

The packages are private and repository-based (there is no registry package), and the latest stable release is [`v0.6.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.6.0). To build from a checkout, see [the getting-started guide](docs/getting-started.md) for the full walkthrough. The short path is:

```bash
rustup target add wasm32-unknown-unknown
pnpm install
pnpm build
pnpm local:install -- --prefix "$HOME/.local"          # preview, writes nothing
pnpm local:install -- --prefix "$HOME/.local" --apply  # writes twelve shims under <prefix>/bin
pnpm local:check -- --prefix "$HOME/.local"            # read-only verification
```

Once `<prefix>/bin` is on your PATH, the installed CLI exposes the four read-only project workflows:

```bash
omp brief ./project --markdown
omp risks ./project --markdown
omp next ./project --markdown
omp handoff ./project --markdown
```

Run `omp --help` for the full command reference, or `omp <namespace> --help` for a namespace.

MCP onboarding needs no manual path: the installed CLI prints a ready client configuration with `omp mcp-config` (add `--markdown` for a documented block, `--name <name>` for a custom server key). From a repository checkout use `pnpm mcp:config -- --prefix "$HOME/.local" --markdown`, which takes an explicit prefix. The installer is preview-first and never edits your PATH, shell profiles, or MCP client configuration. This is the repository build of the source line in `version.json`; the latest published stable release is [`v0.6.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.6.0). Installed release archives require only Node.js 20+.

### Historical stable release (v0.2.0)

> Historical. The current install target is [`v0.6.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.6.0).

The [`v0.2.0` release](https://github.com/he8um/oh-my-pm/releases/tag/v0.2.0) — superseded as latest stable by [`v0.6.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.6.0) — ships three assets:

```text
oh-my-pm-v0.2.0.tar.gz
oh-my-pm-v0.2.0.zip
oh-my-pm-v0.2.0-SHA256SUMS.txt
```

Stable archive users need only Node.js 20+ (no Rust or pnpm). Download, verify the checksums, extract, then use the preview-first installer (see [Self-installation from a release bundle](#self-installation-from-a-release-bundle)) — see [the v0.2.0 release notes](docs/releases/v0.2.0.md). The earlier [`v0.1.0` release](docs/releases/v0.1.0.md) remains available as a preserved historical stable.

### Portable release bundle (development)

A maintainer can assemble a self-contained, versioned bundle from `main` that runs on Node.js 20+ with no Rust, pnpm, or repository checkout. The bundle directory is named `oh-my-pm-v<version>/`, where `<version>` is the canonical version in [`version.json`](version.json):

```bash
pnpm build
VERSION="$(node -p "require('./version.json').version")"
pnpm release:bundle -- --output .release --apply   # writes .release/oh-my-pm-v$VERSION/
node ".release/oh-my-pm-v$VERSION/bin/omp.mjs" status
node ".release/oh-my-pm-v$VERSION/bin/omp-mcp.mjs"
```

The bundle contains the compiled packages, the real Rust/WASM Kernel, the CLI workflows, the twelve read-only MCP tools, deterministic `RELEASE.json` metadata, and `SHA256SUMS`. This is the development-build path; a published stable release provides the same artifact shape and is the recommended install target for users.

### Deterministic release archives

The verified bundle can be packaged into two byte-reproducible archives plus a checksum file:

```bash
pnpm release:archives -- --bundle ".release/oh-my-pm-v$VERSION" --output .release --apply
pnpm release:archives:check -- --assets .release
pnpm release:archives:repro -- --bundle ".release/oh-my-pm-v$VERSION"
```

Both archives expand to a single `oh-my-pm-v<version>/` directory and re-pass the bundle verifier. The `v0.1.0` GitHub Release was published through the manually gated `Release v0.1` workflow; `v0.2.0-rc.1` was published as a prerelease through `Release v0.2 RC`; the stable `v0.2.0` release was published through `Release v0.2 Stable` — see [the stable publishing guide](docs/releases/publishing-v0.2.0.md) and [the post-stable closure report](docs/releases/v0.2.0-post-stable-closure.md).

### Self-installation from a release bundle

Every portable bundle ships a preview-first installer at `bin/omp-install.mjs`. Download and verify the archive, extract it, preview the installation, then apply it into an explicit prefix. Substitute the release you downloaded for `<version>`:

```bash
# Verify checksums first (both archives):
sha256sum --check oh-my-pm-v<version>-SHA256SUMS.txt

tar -xzf oh-my-pm-v<version>.tar.gz
# or: unzip oh-my-pm-v<version>.zip

# Preview writes nothing.
node ./oh-my-pm-v<version>/bin/omp-install.mjs --prefix "$HOME/.local"

# Apply installs a versioned, source-independent copy under the prefix.
node ./oh-my-pm-v<version>/bin/omp-install.mjs --prefix "$HOME/.local" --apply

# Add the prefix bin to PATH yourself — the installer never edits it.
export PATH="$HOME/.local/bin:$PATH"

omp status
omp brief ./project --markdown
# GitHub opt-in (read-only, network only when invoked):
omp github brief owner/repository --markdown
# Installed stdio MCP server (absolute command, twelve read-only tools):
"$HOME/.local/bin/omp-mcp"
```

Installation is preview-first and requires an explicit `--prefix`; `--apply` is required for any write, and `--force` replaces only the exact managed targets (it is not a version-policy engine). The installer never downloads anything, never edits your PATH, shell profiles, or MCP client configuration, and never writes to project files. After a successful apply the installation is independent of the extracted bundle — you may move or delete the archive and extraction directory, and the installed commands (and the whole prefix, if relocated) keep working. The optional `OH_MY_PM_GITHUB_TOKEN` stays environment-only. This is the recommended install path for a published stable release; the earliest `v0.1.0` stable requires manual extraction, because its immutable archive predates this installer.

## Local project configuration

Each project may define an optional `oh-my-pm.config.json` file at its root.

The configuration controls which Markdown documents are analyzed and may lower the default file and byte limits. It cannot raise safety limits, enable writes, execute code, load environment variables, or access files outside the selected project root.

```json
{
  "version": 1,
  "documents": {
    "include": ["README.md", "docs/**/*.md"],
    "exclude": ["docs/archive/**", "docs/drafts/**"],
    "maxFiles": 100,
    "maxBytesPerFile": 131072,
    "maxTotalBytes": 1048576
  }
}
```

Document selection follows a fixed precedence:

```text
include match → exclude check → safety limits → read-only analysis
```

- exclude rules win over include rules
- hard ignored directories (for example `.git` and `node_modules`) cannot be re-enabled
- only `<project-root>/oh-my-pm.config.json` is read; there is no upward config search
- configuration is JSON only and is optional — an absent config preserves current behavior
- an invalid config blocks the workflow with exit code `2` before any analysis
- all four workflows — `brief`, `risks`, `next`, and `handoff` — use the same resolved document set

Supported glob operators are `*` (zero or more non-slash characters), `?` (exactly one non-slash character), and `**` (across path segments, including zero). Matching is case-sensitive; the Markdown extension gate itself remains case-insensitive.

## MCP server

OH MY PM exposes its workflows over a read-only MCP stdio server with exactly
**twelve** tools and **zero** write tools — four local (filesystem-only), four
GitHub (read-only network), two provider diagnostics, and two Project Brain
memory tools:

Local project tools (offline, require a local `root`):

- `project_brief`
- `project_risks`
- `project_next`
- `project_handoff`

GitHub tools (read-only outbound request to `api.github.com` only when called;
`repository`, `limit`, and the source-selection fields — `source`, `state`,
`number`, `query`, `kind` — are optional and fall back to the configured
`providers.json` defaults):

- `github_project_brief`
- `github_project_risks`
- `github_project_next`
- `github_project_handoff`

Provider diagnostics tools:

- `provider_status` — offline resolved provider state; reports token presence only
- `github_provider_diagnostics` — offline GitHub diagnostics; one read-only `GET` only when `confirmNetwork` is set

Project Brain memory tools (offline; read already-captured local memory, need no
project root, write nothing, and perform no network request):

- `project_changes` — compare the two most recent committed snapshots in
  authoritative capture order
- `project_timeline` — a bounded, deterministic history of project changes
  derived from adjacent committed snapshots, filterable by category and item kind
  and paginated by capture

No MCP tool writes a project file or application state, and the transport is
stdio only.

Provider configuration (`providers.json`) is optional, strictly read-only, and
never stores a secret; see [provider configuration](docs/providers/configuration.md)
and [provider diagnostics](docs/providers/diagnostics.md).

After building the workspace, start the server with:

```bash
node mcp-server/bin/omp-mcp.mjs
```

The local tools respect `oh-my-pm.config.json` and stay filesystem-local. The
GitHub tools perform read-only outbound API requests only when invoked; server
startup and `tools/list` make no network request. Supply the optional
`OH_MY_PM_GITHUB_TOKEN` to the server process environment when needed — the MCP
client-config generator never inserts secrets. The server never modifies files,
never uploads local project context, uses no telemetry, and exposes no HTTP
endpoint.

For an installed release, use the installed server's **absolute** command with
empty `args` (this is the recommended form for release users):

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "/absolute/path/to/prefix/bin/omp-mcp",
      "args": []
    }
  }
}
```

Replace the placeholder with your installed `<prefix>/bin/omp-mcp` path. The
optional `OH_MY_PM_GITHUB_TOKEN` is supplied only through the server process
environment, never inside this configuration. For a repository build, run the
server directly instead:

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "node",
      "args": ["/absolute/path/to/oh-my-pm/mcp-server/bin/omp-mcp.mjs"]
    }
  }
}
```

---

## Current state

Five release lines have shipped. What is built and released today:

| Capability                                                            | State                                |
| --------------------------------------------------------------------- | ------------------------------------ |
| Deterministic Rust/WASM Kernel                                        | shipped                              |
| Contracts generated to TypeScript and Rust                            | shipped                              |
| Runtime, Planner, Skills                                              | shipped                              |
| Local Markdown project analysis (`brief`, `risks`, `next`, `handoff`) | shipped                              |
| Read-only GitHub provider workflows                                   | shipped                              |
| Provider diagnostics (`providers status`, `providers doctor`)         | shipped                              |
| Project Brain and local Project Memory                                | shipped (schema 1, store format 2)   |
| Seven `memory` subcommands                                            | shipped                              |
| Twelve read-only MCP tools, zero write tools                          | shipped                              |
| Local installation and release bundles                                | shipped                              |
| Deterministic archives and cross-platform installed qualification     | shipped                              |
| Shared application boundary (`@oh-my-pm/application`)                 | v0.5.1, published                    |
| Local Project Dashboard                                               | planned beyond v0.6, not implemented |

The v0.5 line is complete through **v0.5.4** (contract and repository
consistency), and the current stable is **v0.6.0** (canonical `omp` command
migration). See
[`ROADMAP.md`](ROADMAP.md) and [`docs/roadmap.md`](docs/roadmap.md).

---

## Security model

The enforced security posture is:

- local-first by default
- no telemetry, no cloud, no user accounts
- no secrets in repository files, logs, issues, examples, or fixtures
- read-only external context integrations (`GET`-only, fixed origin)
- explicit user-controlled setup for any external connection
- the analyzed project is never written; application state lives outside it

These are enforced by `pnpm validate:boundaries` and `pnpm validate:structure`,
not merely intended. See [`docs/security-model.md`](docs/security-model.md) and
[`SECURITY.md`](SECURITY.md).

---

## Contributing

Public contributions should stay narrowly scoped and aligned with the published architecture and roadmap. Every change must pass the repository's validation suite (`pnpm validate`), which enforces structure, dependency boundaries, contracts, command surface, and documentation truth.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening an issue or pull request.

---

## License

MIT © 2026 AmirHesam Piri
