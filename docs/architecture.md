# Architecture

OH MY PM is a local-first project intelligence system. It reads project context,
derives deterministic project-management results from it, and persists an
explicit local project history — without writing to the analyzed project, without
a cloud service, and without telemetry.

This document describes the system as implemented. The layer boundaries below
are not aspirational: each one is enforced by
[`tools/validate-boundaries.mjs`](../tools/validate-boundaries.mjs), by
package-level boundary tests, and by the release and installation qualification
tooling.

## System facts

| Fact                        | Value                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| Source version              | see [`version.json`](../version.json) — the single source of truth                |
| Runtime requirement         | Node.js 20+ (installed archives need nothing else)                                |
| Canonical commands          | `omp`, `omp-mcp`, `omp-install`                                                   |
| Deprecated aliases          | `oh-my-pm`, `oh-my-pm-mcp`, `oh-my-pm-install` — no removal scheduled             |
| MCP tools                   | twelve read-only, zero write                                                      |
| MCP transport               | stdio only                                                                        |
| Memory subcommands          | seven (`capture`, `changes`, `status`, `history`, `export`, `delete`, `timeline`) |
| Project Brain schema        | `1`                                                                               |
| Project Memory store format | `2`                                                                               |
| Packages                    | private pnpm workspace packages, never published to npm                           |
| Network surface             | the explicitly invoked read-only GitHub provider only                             |

Every workspace package is versioned from `version.json` and marked
`"private": true`. There is no npm package and no registry publication step in
any release path.

## Dependency direction

```text
CLI ───────────┐
MCP ───────────┼──> Application ──> Runtime / Providers / Project Memory
Future UI ─────┘                    └──> Planner / Skills / Kernel
```

The **Future UI** line is architectural context only. v0.5.1 implements **no
Dashboard**, no web UI, no HTTP server, and no UI package. It appears in the
diagram to record why the Application layer exists: a third presentation surface
must be able to reach the shared use cases without depending on a
command-line package.

Before v0.5.1 the direction was inverted — `@oh-my-pm/mcp-server` depended on
`@oh-my-pm/cli` to reuse project loading, runtime composition, provider
diagnostics, and Project Memory orchestration. That dependency is gone. The MCP
adapter no longer depends on the CLI adapter.

Dependencies point one way only. No lower layer imports a presentation adapter,
and no package imports another package's internal `src/` path.

## Layers

### Contracts

`@oh-my-pm/contracts` owns the shared data shapes for the whole workspace. The
shapes are authored as JSON Schema declarations under `contracts/schema/` and
generated deterministically into committed TypeScript and Rust outputs under
`contracts/generated/`. Both languages consume the same declarations, so a
contract change cannot diverge between the Rust Kernel and the TypeScript
packages.

**Must not:** contain behavior, import any other workspace package, import a
Node built-in, or be hand-edited under `generated/` — drift is a validation
failure.

### Rust/WASM Kernel

`kernel/crate` is the pure, deterministic control plane: schema validation,
project state transitions, the update guard, the version registry, and the
Project Brain primitives (canonicalization, normalization, content
fingerprinting, snapshot diffing, freshness derivation, identifier seeding, and
timeline derivation). It is compiled to WebAssembly and reached from TypeScript
through `@oh-my-pm/kernel` (`kernel/binding`), which loads the WASM module and
exposes the typed `KernelApi` and `ProjectBrainKernelApi` surfaces.

**Must not:** perform I/O of any kind. No filesystem, no network, no
environment, no clock, no randomness — every input arrives as a function
argument. No TypeScript package may import from `kernel/crate` directly; the
binding is the only entry point.

### Application layer

`@oh-my-pm/application` is the shared application boundary introduced in
v0.5.1. It owns the reusable use cases that every presentation surface needs:

- local project workflows over configured Markdown documents (`brief`, `risks`,
  `next`, `handoff`),
- GitHub-backed project workflows with fail-closed resolution ordering,
- provider status and doctor diagnostics,
- Project Memory orchestration — capture, status, history, changes, timeline,
  export, delete,
- deterministic Runtime request construction,
- the shared command-surface vocabulary and the presentation-neutral response
  projection.

Every use case returns a typed structured result. Failures are data, not thrown
errors, so each adapter maps the same failure to its own idiom — an exit code for
the CLI, an MCP tool error for the MCP server.

Side-effecting dependencies are injected as parameters, which is what keeps the
core surface Node-free and the tests offline.

#### Two export surfaces

| Surface                      | Contents                                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@oh-my-pm/application`      | Use-case contracts, dependency-injected orchestration, structured errors, shared result types, and the response projection. **Node-free** — it imports no `node:` builtin.                                 |
| `@oh-my-pm/application/node` | Read-only filesystem adapters, project config and document loading, provider config resolution, the GitHub token boundary, local Project Memory store construction, and the composed Node dependency sets. |

Node filesystem objects never leak into domain-level results. Adapters return
plain data, and a result may echo a caller-supplied reference but never a
resolved absolute path. One documented exception is pinned by a boundary test:
`memory-process.ts` may read `process.pid` to derive the store's internal
staging operation id — the value is never printed, never persisted in a Project
Brain payload, and every caller may inject `processId` instead.

**Must not:** parse `process.argv`, write to stdout or stderr, call
`process.exit`, produce CLI help text, know an executable name, know MCP
JSON-RPC or construct MCP tool responses, render terminal text or HTML, open a
port or start an HTTP server, or depend on CLI, MCP, Installer, or Distribution.

### Runtime

`@oh-my-pm/runtime` is the deterministic request-handling engine. It validates a
request through the injected Kernel boundary before dispatch, orchestrates the
Planner, provider registry, and Skills for the plan path, and returns a
structured response with a deterministic trace. `Runtime.handle()` dispatches
exactly three request kinds: `status`, `doctor`, and `plan`.

The separate **Project Brain Runtime** (`createProjectBrainRuntime`) is the
capture/compare/timeline API. It reaches persistence only through a structural
port, never by importing the persistence package directly. It is invoked in
production through the Application layer's memory orchestrator, which backs the
seven `omp memory` subcommands and the read-only `project_changes` and
`project_timeline` MCP tools.

**Must not:** import a Node built-in, own use cases, resolve provider
configuration, construct Node filesystem adapters, or know about the CLI or MCP.
It is deliberately below the use-case layer and its contract stays narrow.

### Planner

`@oh-my-pm/planner` classifies request intent, extracts provider requests from
planner context, and shapes the task graph with its node ids and dependency
ordering. It is a pure transformation from a planner input to a validated graph.

**Must not:** import a Node built-in, execute providers or skills, perform I/O,
or read the clock.

### Providers

`@oh-my-pm/providers` is the read-only context provider framework. The local
provider is an in-memory provider over caller-supplied items and performs no
filesystem access of its own. The GitHub provider is strictly read-only over a
single fixed origin, with pure query building, pure source selection, pure
configuration validation, and pure settings resolution. Exactly one module —
`providers/src/github/transport.ts` — is the network boundary; every other
GitHub module is pure.

**Must not:** import a Node built-in outside the transport module, read
environment variables (the token is injected by a process adapter), issue a
non-`GET` request, use GraphQL, perform any mutation, or reach an origin other
than the configured one.

### Skills

`@oh-my-pm/skills` holds the deterministic project-management transformations:
`summarizeStatus`, `extractRisks`, `deriveNextTasks`, `createHandoff`, and
`reviewChanges`. The same input envelope always produces the same output
envelope. Extraction is source-aware and line-level: recognized Markdown
headings, checklist state, explicit markers, and exact GitHub label/status
rules — English and Persian both recognized by exact normalized match.

There is no LLM, no embedding model, no fuzzy matcher, and no probabilistic
scorer anywhere in this layer. See
[the deterministic extraction guide](./deterministic-extraction.md).

**Must not:** import a Node built-in, touch the filesystem, the network, the
real clock (time arrives as `context.now`), or randomness. Skills never emit
raw bodies, labels, provider responses, tokens, headers, or transport metadata —
only the bounded public provenance fields.

### Project Memory

`@oh-my-pm/project-memory` is the private local persistence adapter for the
Project Brain and the explicit **application-data write boundary**. It stores
minimized, immutable snapshot and evidence records — already finalized by the
Kernel — in a local application-data location that is never inside the analyzed
project.

| Property     | Guarantee                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Dependencies | none; Node 20 built-ins only                                                                                         |
| Writes       | atomic temp-then-rename; the manifest rename is the commit point                                                     |
| Integrity    | domain-separated SHA-256 over canonicalized bodies for the manifest, each record, and export inventories             |
| Locking      | single-writer exclusive lock; reads never lock; a lock is stale only when it is both old and owned by a dead process |
| Minimization | payloads whose keys normalize to a secret- or raw-content-bearing name are refused before a byte is written          |
| Reads        | no auto-repair, no orphan adoption; corruption produces a controlled error with a sanitized hint                     |

Store format `2`, Project Brain schema `1`. Neither changed in v0.5.1 and no
migration is required. `node-adapter.ts` is the only module that performs real
filesystem I/O; the store is dependency-injected against an abstract
`FileSystem` port, so the write boundary is one auditable file.

**Must not:** analyze, normalize, fingerprint, or diff records (those are Kernel
concerns), write anywhere inside the project root, reach the network, or emit
telemetry. Only the Application layer takes a production dependency on it; the
Runtime reaches it through a structural port.

### CLI adapter

`@oh-my-pm/cli` is the command-line presentation adapter. It owns argument
parsing, the command grammar, help text, output mode selection (brief, JSON,
Markdown), CLI-specific error formatting, exit-code mapping, the stdout/stderr
process boundary, and command-name compatibility behavior for the deprecated
alias.

Commands: `status`, `doctor`, `plan`, `brief`, `risks`, `next`, `handoff`,
`github <brief|risks|next|handoff>`, `providers status`, `providers doctor`,
`memory <capture|changes|status|history|export|delete|timeline|repair>`,
`install-preview`, and `mcp-config`.

**Must not:** own shared application logic, invoke itself as a subprocess, parse
an MCP response, be depended on by another presentation surface, or trigger real
install execution (`install-preview` is dry-run only). Only the explicitly
allowlisted boundary files may import `node:fs`/`node:path`, and no CLI source
may import an archive, compression, or crypto module.

### MCP adapter

`@oh-my-pm/mcp-server` is the Model Context Protocol presentation adapter. It
registers tools, validates input schemas, calls the same Application use cases
the CLI calls, and maps each typed result through a strict public projection. It
owns JSON-RPC, tool annotations, and protocol stdout safety. As of v0.5.1 it has
no dependency on `@oh-my-pm/cli`.

The installed surface is exactly **twelve read-only tools, zero write tools,
stdio transport only**: four local Markdown workflows, four GitHub workflows,
two provider diagnostics tools, and two read-only Project Brain memory tools
(`project_changes` and `project_timeline`).

Results carry the human-readable Markdown identical to the CLI's `--markdown`
output plus a compact `structuredContent` projection. The projection never
contains raw document bodies, raw provider responses, the internal runtime
response, execution traces, absolute paths, filesystem handles, adapter objects,
secrets, or tokens.

**Must not:** register a write tool, expose an HTTP or SSE transport, import an
HTTP server framework, import a filesystem/network/child-process Node built-in
in package source, read `process.env` outside the single approved GitHub
tool-call boundary, make any request at startup or during `tools/list`, or write
anything to stdout other than protocol messages.

### Installer

`@oh-my-pm/installer` owns the deterministic installation and update lifecycle:
manifest validation, install reports, update-plan checks through the Kernel
boundary, rollback reports, and real transactional installation of a release
bundle into an explicit prefix.

Real installation ships as `omp-install`. It is **preview-first**: a plan is
computed and can be inspected before anything is written, `--apply` is required
to write, `--force` is required to replace an existing managed target, and the
managed target set is exactly the version directory, the command shims, and
`install.json`. Installation copies the versioned bundle, verifies its content
and checksums, stages the shims and manifest, then atomically renames each
managed target into place. The installed layout is
`<prefix>/lib/oh-my-pm/versions/<version>/` with shims under `<prefix>/bin`.

Planning is always separated from execution: the installer core is pure, and
every filesystem effect goes through an explicit adapter. The read-only Node
adapter lists, reads, and checksums under a confined root and refuses symlinks
and out-of-root paths; a single separate write adapter is the only module
allowed to mutate real files.

**Must not:** download an artifact, make any network request, read an
environment-derived prefix or approval, run a package manager, edit `PATH`, edit
a shell profile, edit an MCP client configuration file, or write outside the
explicit prefix.

### Examples

`@oh-my-pm/examples` is a development-only composition harness. It wires the real
packages together — CLI with an injected Runtime, the Planner over a local
Provider and deterministic Skills, the exported read-only MCP runner without
spawning a stdio process, and the Installer through in-memory and explicit write
adapters — so that each documented composition is exercised by a test rather than
only described. It publishes no package and defines no binary.

It is the one workspace package that is **not** part of the release dependency
surface: `@oh-my-pm/distribution` does not depend on it, and the release bundler
deploys none of its code. Its `fixtures/markdown-project/` tree is the exception
— those fixture documents are copied into the bundle as the sample project the
installed qualification analyzes.

**Must not:** be imported by a shipped package, contribute to the release
dependency graph, or become the only place a behavior is verified.

### Distribution and release lifecycle

`@oh-my-pm/distribution` defines the production dependency surface the release
bundler deploys, and provides the thin portable command entrypoints — `omp`,
`omp-mcp`, `omp-install`, plus the three deprecated aliases. The
entrypoints are process adapters only: no build logic, no repo path, no
filesystem writes, no network.

The release lifecycle is a chain of deterministic, locally verifiable steps:

| Step            | Tool                                    | Produces                                                       |
| --------------- | --------------------------------------- | -------------------------------------------------------------- |
| Bundle          | `pnpm release:bundle`                   | a versioned portable bundle with an internal `SHA256SUMS`      |
| Verify bundle   | `pnpm release:check`                    | profile, entrypoint, and content qualification                 |
| Archive         | `pnpm release:archives`                 | byte-reproducible `.tar.gz` and `.zip` plus a `SHA256SUMS.txt` |
| Verify archives | `pnpm release:archives:check`, `:repro` | archive integrity and reproducibility                          |
| Install         | `pnpm release:install`                  | a transactional prefix install from the local bundle           |
| Verify install  | `pnpm release:install:check`            | installed-state qualification, platform-aware                  |

The current v0.5 bundle profile is `omp-cli-namespace`, which always packages
`@oh-my-pm/project-memory` — so an installed server always registers all twelve
MCP tools. A bundle runs on Node.js 20+ with no Rust, no pnpm, and no repository
checkout.

**Must not:** publish to a registry, create or move a tag, create a GitHub
release, upload or download an artifact, reach a remote host, or read
`process.env`. Every release tool is checked for those markers, and the
distribution package must be `private` with no `publishConfig`.

### Validation and qualification

Validation is part of the architecture, not a CI afterthought. `pnpm validate`
runs the full chain:

| Check                 | Enforces                                                         |
| --------------------- | ---------------------------------------------------------------- |
| `validate:public`     | no private or internal language in tracked public files          |
| `validate:structure`  | the expected workspace layout                                    |
| `validate:boundaries` | every layer boundary described in this document                  |
| `validate:contracts`  | generated TypeScript and Rust match the JSON Schema declarations |
| `version:check`       | one version across `version.json` and every manifest             |
| `validate:commands`   | the command surface matches `command-surface.json`               |
| `validate:references` | documented commands exist                                        |
| `validate:docs`       | active documentation states the real current facts               |

`tools/validate-doc-truth.mjs` derives its expectations from canonical sources —
`version.json`, `command-surface.json`, the MCP tool registration source, the
memory subcommand constant, and the package manifests — so a product change
changes the expectation and the documentation must follow. It distinguishes
**active** documents from **historical** ones: `docs/releases/**`, `docs/v0.3/**`,
`docs/v0.4/**`, and `docs/architecture/**` are point-in-time records and are
never rewritten to today's numbers.

Beyond static validation, qualification runs the real thing: `pnpm mcp:smoke`
drives the stdio server end to end against an isolated data root, and the
release-install checks launch the installed commands on each supported platform.

## Boundaries

### Data ownership

Each layer owns exactly one kind of state, and no other layer may reach it.

| Owner          | State                                                                |
| -------------- | -------------------------------------------------------------------- |
| Contracts      | the shape of shared data                                             |
| Kernel         | validation verdicts, transition decisions, Project Brain derivations |
| Runtime        | in-flight request state and the deterministic trace                  |
| Providers      | normalized read-only context items                                   |
| Project Memory | persisted Project Brain snapshot and evidence records                |
| Application    | use-case composition and the typed result shape                      |
| CLI / MCP      | presentation state and the process/protocol boundary                 |
| Installer      | the installed prefix manifest                                        |

### Read-only project boundary

The analyzed project is **never written**. Every local workflow reads Markdown
documents from the user-selected root and nothing else: files ending `.md` or
`.markdown` are loaded recursively, symbolic links are never followed, nothing
outside the requested root is read, and hard-ignored directories (`.git`,
`node_modules`, `dist`, `target`, and the rest) can never be re-enabled by
configuration.

Deterministic limits apply — at most 200 files, 256 KiB per file, 2 MiB total —
and the optional `<project-root>/oh-my-pm.config.json` may only lower them,
never raise them. Configuration discovery is exact: only that one path is
considered, with no upward search. The config never enables a write, never
executes code, never reads an environment variable, and never reaches outside the
selected root.

Document content is read, transformed, and rendered. It is never persisted into
the project, never transmitted, and never logged.

### Application-data write boundary

The only write path for derived project state is Project Memory, and it always
writes to a resolved application-data location that is separated from — and
never nested inside — the project root. Preview and apply are separate use
cases: **a preview performs zero writes**. It creates no data directory,
acquires no lock, and writes no staging, manifest, record, or lock file. A
preview is never implemented by writing and rolling back.

The agent-facing surface cannot choose a location: no MCP tool accepts a `root`,
`dataDir`, or `path` input for memory, and the standard application-data
location is resolved internally.

### Provider network boundary

There is exactly one outbound network path in the entire system, and it is
opt-in at the point of invocation.

| Property    | Value                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Method      | `GET` only — no `POST`/`PATCH`/`PUT`/`DELETE`, no GraphQL, no mutation                                                                                             |
| Origin      | a single fixed origin (`api.github.com`), pinned REST API version                                                                                                  |
| Trigger     | only an explicitly invoked `github` command or GitHub MCP tool; never at startup, never during `tools/list`                                                        |
| Diagnostics | offline by default; `providers doctor` reaches the network only with explicit `--confirm-network` / `confirmNetwork: true`, and then makes exactly one request     |
| Transport   | one module, with a request timeout, a response-byte ceiling, bounded same-origin redirects only, and header filtering                                              |
| Token       | optional, supplied only via `OH_MY_PM_GITHUB_TOKEN`, read only at the tool-call boundary, never a CLI argument, never an MCP input, never printed, never persisted |
| Uploads     | none — local project context is never sent anywhere                                                                                                                |

Resolution order is a safety property: configuration, repository, and selection
all resolve **before** a token is read or a transport is constructed, so every
controlled failure stays offline.

### MCP stdio boundary

The only transport is local stdio. There is no HTTP, SSE, host, port, listener,
authentication, or session, and the validator rejects any non-stdio SDK
transport import as well as `express`, `hono`, `fastify`, `ws`, `undici`, and
`dotenv`.

**`stdout` is protocol-only.** No package source, and neither bin wrapper, may
write to `process.stdout` or call `console.log`. A fatal startup error writes one
concise line to `stderr` and exits non-zero. The deprecated `oh-my-pm-mcp` alias
is held to the identical rule — its deprecation warning goes to stderr only —
because the stdout ban is exactly what keeps the JSON-RPC stream parseable.

### Release artifact boundary

Release tooling is local and reproducible. It may compute checksums, deploy the
workspace into a bundle, and write inside an explicit output directory. It may
not publish, tag, upload, download, reach a registry or remote host, read the
environment, edit a shell profile, or edit an MCP client configuration.
Archives are byte-reproducible and accompanied by a checksum file. Publishing a
release remains a deliberate, manual act outside the tooling.

### Deterministic Kernel boundary

The Kernel is the determinism anchor. It performs no I/O of any kind — no
filesystem, network, environment, clock, or randomness. Time and identity always
arrive as input. This is what makes the Project Brain derivations (canonical
form, content fingerprint, snapshot diff, freshness, timeline) reproducible
across machines, and it is why persistence lives in a separate package rather
than being folded into the Kernel.

The same discipline extends outward: Contracts, Runtime, Planner, Providers, and
Skills may not import a Node built-in at all. Only the explicit, allowlisted
adapter boundaries touch the platform.

### Presentation adapter responsibilities

A presentation adapter owns its process or protocol and nothing else.

| Concern                                     | CLI   | MCP                     | Application                     |
| ------------------------------------------- | ----- | ----------------------- | ------------------------------- |
| Argument grammar and help                   | yes   | —                       | never                           |
| JSON-RPC, tool schemas, annotations         | —     | yes                     | never                           |
| stdout / stderr, exit codes                 | yes   | stderr + exit code only | never                           |
| Terminal or Markdown rendering              | yes   | yes (shared projection) | projection only, never a stream |
| Use-case orchestration                      | never | never                   | yes                             |
| Filesystem, provider config, token boundary | never | never                   | `/node` surface only            |

Because both adapters call the same use cases, parity between the CLI and the
MCP surface is structural rather than maintained by hand. A future Dashboard
would import the same use cases and add only its own presentation package.

### Failure sanitization

Failures are typed data, and every message is sanitized before it leaves the
Application layer.

A failure never contains a raw or absolute filesystem path, a resolved project
root, a token or credential value, an environment value, raw configuration text,
a raw provider response, an internal runtime response, an execution trace, an
adapter object, or any document body or excerpt. A result may echo the
caller-supplied root reference; it never echoes what that reference resolved to.

The MCP adapter returns a concise `<code>: <message>` tool error with no stack
trace and no path. Provider diagnostics report token **presence** only. Project
Memory refuses a payload whose keys normalize to a secret- or
raw-content-bearing name before writing a single byte, and reports corruption
through a controlled error with a sanitized recovery hint.

### Absence of cloud and telemetry

There is no cloud component, no account, no session, no remote analytics, no
crash reporting, and no telemetry of any kind — not opt-out, not anonymous, none.
No background daemon, filesystem watcher, scheduled task, or automatic capture
exists. Nothing runs unless a command is invoked or a tool is called.

The validator enforces this negatively: `telemetry`, `logger`, and
`console.log`/`console.error` are forbidden markers across the installer,
MCP, and local-install tooling surfaces, and no source may hold key or
certificate material.

## Design principles

- Keep core logic local and deterministic.
- Keep external integrations read-only and explicitly invoked.
- Keep project state explicit and validated at the boundary.
- Keep planning separate from execution, and preview separate from apply.
- Keep every I/O effect in a single, named, auditable module.
- Keep release transitions controlled and reproducible.
- Keep the dependency direction one-way, so a new surface costs nothing.

## See also

- [v0.5.1 scope](./v0.5/v0.5.1-scope.md) — the architecture decision behind the Application layer
- [`@oh-my-pm/application`](../application/README.md) — ownership and use-case inventory
- [Security model](./security-model.md)
- [Deterministic extraction](./deterministic-extraction.md)
- [Getting started](./getting-started.md)
- [Roadmap](./roadmap.md)
