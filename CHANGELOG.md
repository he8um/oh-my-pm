# Changelog

## [Unreleased]

## [0.6.0]

Canonical `omp` command migration and public surface stabilization, **published
as the latest stable release**
([`v0.6.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.6.0)). This is a command namespace migration, not a product
rename and not a data migration.

**No behavior changes beyond the executable names.** No command added or removed,
no changed CLI syntax or output schema, no changed MCP tool, schema, annotation,
or tool order, no failure code renamed or removed, no changed exit code, no
Project Brain schema change, no Project Memory format change, and **no migration
is required**.

### Added

- Canonical executables `omp`, `omp-mcp`, and `omp-install`, with entrypoints in
  `cli/bin/`, `mcp-server/bin/`, and `distribution/bin/`.
- A **compatibility alias** class, distinct from the deprecated class.
  `ohmypm`, `ohmypm-mcp`, and `ohmypm-install` were canonical in v0.5, so they
  are fully supported rather than deprecated; demoting a name that was canonical
  one minor version ago would retroactively withdraw a promise.
- `command-surface.json` schema version 2: a pinned `product` identity block
  (name, slug, package scope, environment prefix, archive prefix, MCP server key)
  and per-role `canonical` / `compatibilityAliases` / `deprecatedAliases`.
- Manifest invariants enforced by `pnpm validate:commands`: one canonical name
  per role, no duplicate executable name, no alias equal to a canonical name, no
  alias in two classes or two roles, and no renamed product identity.
- `RELEASE.json` declares `compatibilityAliases`, `deprecatedAliases`, and
  `commandsCanonicalSince` as distinct fields.
- The `omp-cli-namespace` bundle profile, and the `Release v0.6 Stable` workflow.
- `docs/v0.6/README.md` — the migration guide.

### Changed

- `omp*` is canonical in help output, examples, active documentation, and
  generated MCP client configuration.
- An install now writes **twelve** shims (six commands × POSIX + `.cmd`); the
  release bundle ships **nine** executables. Both counts are derived from the
  manifest, never restated.
- Alias notices are per class: ``Warning: `ohmypm` is a compatibility alias; use
`omp`.`` and ``Warning: `oh-my-pm` is deprecated; use `omp`.``
- `docs/v0.5/README.md` is marked superseded by `docs/v0.6/README.md`.

### Deprecated

- `oh-my-pm`, `oh-my-pm-mcp`, and `oh-my-pm-install` remain deprecated.
  **No removal is scheduled** for either alias family.

### Unchanged

Product name **OH MY PM**, package scope `@oh-my-pm/*`, environment prefix
`OH_MY_PM_*`, `.oh-my-pm/` and `~/.oh-my-pm/` data directories, the
`lib/oh-my-pm/versions/<version>/` install layout, `oh-my-pm-v<version>` archive
names, and the `oh-my-pm` MCP server key. Alias stdout is byte-identical to
canonical stdout, notices are stderr-only and emitted exactly once, exit codes
match, and the MCP stdio stream stays protocol-clean.

## [0.5.4]

Contract and repository consistency release, **prepared but not yet published**.
It adds shared contracts at the application boundary and makes the package
dependency model explicit and mechanically enforced.

**No public behavior changes.** No new or removed command, no changed CLI syntax
or output, no changed MCP tool, schema, annotation, or tool order, no failure code
renamed or removed, no changed exit code, no Project Brain schema change, no
Project Memory format change, and **no migration is required**.

The audit behind this release found the dependency graph already acyclic, no
cross-package deep `src/` imports, `@oh-my-pm/contracts` already
dependency-free, and the CLI exit codes already consistent with the documented
policy. Those are **locked in** here, not repaired.

### Added

- `packages.json` — the authoritative package catalog. Every workspace package
  gets one role plus an explicit contract: allowed dependencies, forbidden
  inversions, responsibilities and non-responsibilities, public entry points,
  permitted process side effects, data ownership, release-bundle status,
  compatibility surface, and test ownership. The layer order
  (`contract < capability < composition < orchestration < application <
presentation < packaging < development`) is derived from the real graph rather
  than an imported convention.
- `tools/package-catalog.mjs` and `tools/validate-packages.mjs` plus
  `pnpm validate:packages`, wired into `pnpm validate`. Checks are DERIVED from
  the catalog, so a package added later inherits them: no production dependency
  cycle (dev-only edges correctly excluded), dependencies point down the layer
  order and stay inside their allowance, no package reaches inside another's
  `src`/`dist`/`test`, no undeclared workspace import, no package below the
  presentation layer writes to a process stream, declared `exports` match the
  catalog, and `inBundle` claims match the real release closure.
- `application/src/result.ts` — `ApplicationResult<T>` with normalized
  `SourceDescriptor` (a closed set of eight source kinds), `Diagnostic`, and
  `ProvenanceRecord`, plus deterministic serialization that sorts `selection` and
  `details` keys so byte-identical inputs give byte-identical output.
  `assertSafeSourceDescriptor` and `unsafeValueReason` are the single shared
  redaction rule.
- `application/src/taxonomy.ts` — eleven error categories, each with retryability,
  CLI exit code, severity, and MCP error behaviour. Every existing public failure
  code is classified; **none is renamed or removed**.
- `application/src/diagnostics-adapter.ts` — projects the provider reports into
  the unified `Diagnostic` vocabulary.
- `docs/v0.5/contracts.md` — the contract, dependency, and compatibility model,
  including the documented CLI asymmetry.
- `tests/e2e/semantic-parity.test.ts` — 15 direct CLI-vs-MCP assertions for the
  shared workflows. The pre-existing `extraction-parity.test.ts` compares each
  surface against its own expected shape and never against the other, so both
  could pass while the surfaces diverged.
- `application/test/result-contract.test.ts` — 21 tests, and
  `tools/package-catalog.test.mjs` — 20 mutation tests, each introducing one
  violation and asserting the specific guard fires.

### Changed

- `tools/validate-structure.mjs` allows `packages.json` as a top-level contract.
- `@oh-my-pm/application` becomes a root devDependency, because the semantic
  parity test imports the taxonomy to assert exit-code agreement.

### Preserved deliberately

- `ProviderStatusReport` and `ProviderDoctorReport` keep their exact shapes.
  `buildProviderStatusReport(...)` is returned **directly** as the result of the
  `provider_status` and `github_provider_diagnostics` MCP tools, so its
  `schemaVersion: 1` and `ok | info | warning | fail` vocabulary are a
  client-facing contract. An adapter projects them into the unified model instead
  of a rewrite, which would have changed an MCP output schema.
- The CLI's direct `runtime`/`providers`/`skills`/`kernel` composition for
  `status`, `doctor`, and `plan`. Those commands are not exposed through the
  application boundary and no second surface consumes them. Extending the boundary
  purely for symmetry was considered and rejected; the asymmetry is documented.
- `@oh-my-pm/project-memory` as a CLI production dependency — intentional, so it
  ships in the bundle while being reached only through a lazy dynamic import.

## [0.5.3]

Documentation and architecture truth release, **prepared but not yet published**.
It changes **no product code** and adds **no user-facing capability**.

Documentation authority was real but implicit: two arrays inside
`tools/validate-doc-truth.mjs` decided which documents were checked for
present-tense claims and which were exempt as point-in-time records. Nothing
could enumerate that classification, a newly added document silently defaulted to
unclassified and therefore unchecked, and a replaced document could still be
linked from an active index as current guidance.

**No public behavior changes.** No new command, no changed CLI syntax or output,
no changed MCP tool, schema, annotation, or tool order, no Project Brain schema
change, no Project Memory format change, no storage path change, and **no
migration is required**. It includes no Dashboard and does not begin the `omp`
command migration.

### Added

- `docs/manifest.json` — the authoritative documentation classification. Every
  tracked Markdown document describing the product is listed exactly once with
  `status` (`active`, `historical`, `superseded`, `release-record`), `authority`
  (`normative`, `informative`), `appliesTo`, `replacement`, and the `concern` it
  is authoritative about.
- `tools/docs-manifest.mjs` — the single loader over that contract, so the
  validator and the inventory tool agree by construction. It structurally
  validates the manifest: unknown status/authority values, a `superseded` entry
  without a `replacement`, an unresolvable `replacement`, a classified file that
  no longer exists, a path classified twice, an `active` entry declaring a
  replacement, and duplicate authoritative documents for one concern.
- `tools/docs-inventory.mjs` plus `pnpm docs:inventory`,
  `pnpm docs:inventory:check` — a deterministic, offline, read-only report of
  active normative, active informative, historical, superseded, release records,
  broken replacements, classified-but-missing files, and unclassified documents.
  `pnpm docs:inventory:check` is wired into `pnpm validate`.
- `tools/docs-manifest.test.mjs` — seventeen mutation tests. Each introduces one
  contradiction into a disposable git fixture, asserts the validator rejects it
  with that guard's specific message, and asserts the unmutated fixture passes.
- Four documentation drift guards in `tools/validate-doc-truth.mjs`: an active
  document naming a nonexistent `@oh-my-pm/*` package; a real workspace package
  omitted from the authoritative package map (`docs/architecture.md`); a
  `superseded` document still Markdown-linked from an active normative document;
  and full classification coverage, so every tracked document must be classified
  or explicitly excluded. Both package expectations derive from
  `pnpm-workspace.yaml`.

### Changed

- `tools/validate-doc-truth.mjs` derives its active and historical document sets
  from `docs/manifest.json` instead of restating them in two hard-coded arrays.
- `README.md` no longer claims the repository is "the new v2 line". It ships a
  `v0.x` line (`v0.1.0` through `v0.5.2`) and has no `v2.x` target; the rebuild
  that produced this architecture is history, not a pending migration.
- `docs/architecture.md` documents `@oh-my-pm/examples`, the real workspace
  package it had omitted: a development-only composition harness, the one
  workspace package outside the release dependency surface, whose
  `fixtures/markdown-project/` tree is copied into the bundle as the sample
  project the installed qualification analyzes.
- `ROADMAP.md` and `docs/roadmap.md` state the v0.5.3 and v0.5.4 scopes, and no
  longer present the Dashboard as the v0.6 plan — v0.6 is core and public-surface
  work, and the Dashboard is planned beyond it.
- `CHANGELOG.md` is classified as a `release-record` rather than an active
  document, which is what preserves its accurate past claims. Its v0.2.0 entry
  about validating "the four shims" was true before v0.5 introduced the canonical
  `ohmypm` family and made the installed count eight; treating the changelog as
  active would have made the shim-count guard demand that entry be rewritten,
  destroying the release evidence it exists to preserve.

### Preserved

- No file under `docs/releases/**`, `docs/v0.3/**`, `docs/v0.4/**`, or
  `docs/architecture/**` is modified. Historical claims that were true at
  publication time remain unchanged; the fix for a stale-looking historical
  statement is classification, not editing.

## [0.5.2]

Maintenance release, **published as the latest stable release** on
2026-08-01 (tag `v0.5.2`, targeting `6c915e0…`). It fixes one internal
architecture problem and adds **no user-facing capability**: the GitHub-backed
project workflow was duplicated across presentation adapters, because the MCP
server reimplemented the shared pipeline and the CLI assembled its own Runtime
rather than consuming the shared use case.

**No public behavior changes.** No new command, no changed CLI syntax or output,
no changed MCP tool, schema, annotation, or tool order, no Project Brain schema
change, no Project Memory format change, no storage path change, and **no
migration is required**. It includes no Dashboard.

Verified by pre/post byte-parity fixtures across 39 CLI cases and 25 MCP cases,
plus a full MCP protocol-surface capture over real stdio JSON-RPC.

### Added

- `cli/src/github-process.ts` — the focused CLI GitHub adapter. It owns only CLI
  concerns and composes no Kernel, Runtime, providers, skills, or transport.
- `mcp-server/src/version.ts` — the single canonical MCP version identity
  (`OH_MY_PM_MCP_VERSION`), consumed by the server handshake, the project tool
  runner, the GitHub tool runner, and the provider diagnostics runner.
- Architecture guards in `tools/validate-boundaries.mjs`: neither GitHub adapter
  may name the Kernel/Runtime/provider/skill/transport constructors or resolve
  provider settings and source selection itself, both must call the shared use
  case, the core use case may not construct a Node transport or read
  process/clock/filesystem state or hardcode a caller identity, and the MCP
  package may declare only one version literal.
- Application ordering tests that count dependency invocations, proving an
  invalid config, disabled provider, invalid repository, invalid limit, or
  invalid source selection creates no transport, reads no token, and reads no
  clock — and that a valid request creates the transport and reads the clock
  exactly once each.
- `docs/releases/v0.5.2.md` and `docs/releases/publishing-v0.5.2.md`.

### Changed

- `@oh-my-pm/application` owns GitHub workflow sequencing, effective provider
  settings, repository validation, source selection, limit resolution,
  fail-closed ordering, Runtime composition, request construction, execution, and
  output extraction. The CLI and MCP GitHub adapters consume it.
- The shared dependency contract is now lazy and caller-aware: `caller` is a
  required injected value, and `createTransport()` replaces the eagerly-resolved
  `transport`/`token` pair. The optional `OH_MY_PM_GITHUB_TOKEN` read moved
  inside the transport factory closure, so composing dependencies no longer
  touches the environment before validation.
- `@oh-my-pm/application/node` owns the provider-config load, the token
  environment read, platform/cwd resolution, real transport construction, and
  real clock access for the GitHub path.
- The MCP GitHub runner keeps only the agent-safe dependency options and the
  sanitized public projection. It no longer consults the ambient process, so it
  drops off the token-environment allowlist.
- The CLI purity test is **stricter**: `local-process.ts` no longer reads the
  environment or builds a transport, so its GitHub boundary exemption is removed
  and both CLI GitHub files are held to the strictest rules.
- The active v0.5 release workflow targets the v0.5.2 candidate and verifies
  `v0.5.1` as the immutable base stable lineage.

### Fixed

- The shared GitHub use case hardcoded `caller: "mcp"`. It was only reachable
  from MCP, so nothing had broken yet, but routing the CLI through it would have
  silently mislabelled every CLI request identity and payload source.
- Three stale independent version literals: `MCP_GITHUB_RUNTIME_VERSION` and
  `MCP_PROVIDER_DIAGNOSTICS_VERSION` both declared `"0.3.0"` against a `0.5.1`
  source, and the server and project tool runner each restated the version. All
  now derive from `OH_MY_PM_MCP_VERSION`. These values only fed the outbound user
  agent and the server handshake, so no observable output changed.

## [0.5.1]

Maintenance release. It fixes two internal problems and adds **no user-facing
capability**: active documentation no longer matched the shipped product, and
shared application logic lived inside the CLI package, forcing the MCP server to
depend on the CLI to reuse it.

**No public behavior changes.** No new command, no changed CLI syntax or output,
no changed MCP tool or schema, no Project Brain schema change, no Project Memory
format change, no storage path change, and **no migration is required**. It
includes no Dashboard.

### Added

- `@oh-my-pm/application` — a private workspace package owning the shared
  project, GitHub, provider-diagnostics, and Project Memory use cases, with two
  export surfaces: the Node-free `@oh-my-pm/application` core and
  `@oh-my-pm/application/node` for the read-only filesystem adapters.
- `pnpm validate:docs` (`tools/validate-doc-truth.mjs`) — an active-document
  truth validator that derives every expectation from `version.json`,
  `command-surface.json`, the MCP tool registration sites, and the memory
  subcommand allowlist. Included in `pnpm validate`.
- Architecture guards in `tools/validate-boundaries.mjs` covering the
  application dependency direction, the application process boundary, the
  absence of HTTP/UI code, and the absence of any Dashboard package.
- `docs/v0.5/v0.5.1-scope.md`, `docs/v0.5/application-boundary.md`,
  `docs/releases/v0.5.1.md`, and `docs/releases/publishing-v0.5.1.md`.

### Changed

- The CLI is now a presentation adapter: argument parsing, help, terminal
  rendering, exit-code mapping, and the process boundary. Shared orchestration
  moved to the application package.
- The MCP server consumes `@oh-my-pm/application` and **no longer depends on
  `@oh-my-pm/cli`**. It retains MCP registration, input schemas, the strict
  public projections, JSON-RPC transport, annotations, and stdout safety.
- Active documentation corrected to match the shipped product: the README
  source line and MCP tool count, the architecture document, both roadmaps, the
  MCP and CLI references, the getting-started guide, the installer and Project
  Memory package READMEs, the security model, and several source comments that
  described shipped code as unbuilt. Historical documents were deliberately left
  unchanged.
- The v0.5 release workflow targets `0.5.1`; the base stable lineage stays
  pinned to the published `v0.4.0`.

### Release lineage

`v0.5.0` was **never published** — no `v0.5.0` tag or GitHub release exists. It
merged as a source candidate and is superseded by `v0.5.1`, which would be the
first published stable of the v0.5 line. `v0.4.0` remains the latest published
stable and the immutable base.

## [0.5.0]

Stable release opening the v0.5 line. It changes **one** thing — the name you
type. The canonical CLI command family becomes `ohmypm`, `ohmypm-mcp` and
`ohmypm-install`; the former `oh-my-pm` family is retained as deprecated
compatibility aliases with **no removal scheduled**.

This is a CLI command namespace migration, **not a product rename**. There is
**no schema change, no store-format change, and no data migration**: Project Brain
schema stays at 1 and store format at 2, so a store created by the public `v0.4.0`
build is read directly. `v0.4.0` remains immutable and unchanged. No registry
publication; all workspace packages remain private.

### Changed

- **`ohmypm` is the canonical CLI**, `ohmypm-mcp` the canonical MCP stdio server,
  and `ohmypm-install` the canonical release-bundle installer. Every active help
  line, usage string, example, error hint, README snippet, and document now shows
  the canonical command. Help renders from a single constant rather than a
  hard-coded name.
- **Newly generated MCP configuration invokes `ohmypm-mcp`.** The server
  registration **key** deliberately remains `oh-my-pm` — it is a product identity,
  not a command — so an existing client entry keeps its key and only the `command`
  value needs regenerating.
- **A local or release installation creates all eight command shims** — the two
  canonical installed commands plus the two deprecated aliases, each with a POSIX
  and a Windows `.cmd` launcher. The installed manifest records `commands`
  (canonical) and `legacyCommands` separately.
- **Release line `v0.5` with the new bundle profile `ohmypm-cli-namespace`.**
  `RELEASE.json` declares `canonicalCommands` and `legacyAliases` as distinct
  fields plus `commandsDeprecatedSince` and `commandRemovalScheduled`, so no
  reader can mistake an alias for a primary command. Previously published profiles
  keep resolving and an unknown profile still fails closed.

### Added

- **`command-surface.json`** at the repository root: the single machine-readable
  source of truth for the public command names, distinguishing canonical commands
  from legacy aliases.
- **`pnpm validate:commands`** proves the command names restated in package
  manifests, both installers, release metadata, the installed-state verifier, and
  generated MCP configuration still agree with the manifest. Those surfaces cannot
  import it at runtime — the CLI and MCP packages are deliberately pure and the
  release-install core must run from inside an extracted bundle — so the check is
  what makes the single-source-of-truth claim enforceable.
- **`pnpm validate:references`** fails when an active README, help file, example,
  installer message, or generated configuration reintroduces a deprecated command
  as the primary one. It is precise about product identity: the product name
  appears legitimately as a package scope, path segment, environment prefix,
  config filename, archive name, and server key, so the check matches only the
  shapes a command _invocation_ takes.
- **Legacy MCP configuration recognition** — `classifyMcpConfigCommand` and
  `legacyMcpConfigGuidance` report a pre-v0.5 configuration as
  legacy-but-functional and recommend regeneration, never as broken. No
  user-owned configuration file is ever rewritten.
- **`.github/workflows/release-v0.5.yml`** — the manually gated v0.5 stable
  release workflow. Nothing is published by adding it.

### Deprecated

- **`oh-my-pm`, `oh-my-pm-mcp` and `oh-my-pm-install`** are deprecated
  compatibility aliases as of 0.5.0. **No removal is scheduled.**

  Each alias runs the same implementation in the same process, forwarding
  arguments, stdin, environment, working directory, exit code, and signal
  behavior unchanged; no application logic is duplicated. The deprecation warning
  goes to **stderr only**, which is what keeps two machine-readable contracts
  intact: `--json` stdout stays a parseable document, and the MCP server's stdout
  stays JSON-RPC protocol-safe. An alias prints the canonical help.

  The aliases never appear in help output, README examples, generated
  configuration, or installation instructions.

### Preserved

- Product name **OH MY PM**, repository `he8um/oh-my-pm`, package scope
  `@oh-my-pm/*`, environment prefix `OH_MY_PM_*`, Rust identifiers `oh_my_pm_*`,
  installation directory `lib/oh-my-pm/versions/<version>/`, release archives
  `oh-my-pm-vX.Y.Z`, project config filename `oh-my-pm.config.json`, provider
  config directories, Project Brain data directories, the MCP server key
  `oh-my-pm`, and the error-code namespace — all unchanged.

### Non-goals

- **No Dashboard work.** No dashboard is designed, implemented, or planned in this
  release.
- No product, repository, package, or environment-variable rename.
- No new CLI command, subcommand, option, or output mode.
- No change to command behavior, JSON schemas, output contracts, storage formats,
  project-memory formats, MCP protocol behavior, or public APIs.
- No storage or data-format migration.

## [0.4.0]

Stable release opening the v0.4 line. It adds **one** main capability —
**Project Timeline** — and changes nothing else. There is **no schema change, no
store-format change, and no migration**; a Project Brain store created by the
public `v0.3.1` build is read directly. `v0.3.1` remains immutable and unchanged.
No registry publication; all workspace packages remain private.

### Added

- **Project Timeline** — a local, bounded, deterministic history of project
  changes **derived** from already-committed Project Brain snapshots. Each query
  reads the store's authoritative capture chronology, compares adjacent committed
  snapshots through the existing deterministic change engine, and projects the
  results into sanitized events. A timeline is recomputed per query and is never
  stored: there is no timeline file, record type, or store.
- **Three bounded contracts** — `TimelineEvent`, `TimelineQuery` and
  `TimelineResult`, added to the existing `projectbrain` contract domain and
  generated deterministically to TypeScript and Rust. `category` and `kind` reuse
  the existing ChangeSet taxonomy exactly (twelve change categories, six item
  kinds); no second taxonomy was introduced.
- **Deterministic Kernel derivation** — orders events by `captureSequence` then
  `eventSequence`, derives `eventId` from canonical domain-separated inputs,
  assigns `eventSequence` over the full change order before filtering (so an
  event's id never depends on which filter the caller passed), applies filters
  before the limit, and paginates by whole captures so a page never splits a
  capture and never duplicates or skips an event. Exposed through one new WASM
  export and one new binding method; the four original `KernelApi` methods are
  untouched. It reads no clock, filesystem, environment, network, or randomness.
- **Read-only Runtime timeline query** — provider-independent. Zero writes, zero
  locks, no directory creation, no capture, migration, export, delete, provider
  call, or network. There is no fallback to a lexical snapshot-id order and no
  fallback to timestamps while a capture sequence exists; a store exposing no
  authoritative chronology fails closed instead.
- **`oh-my-pm memory timeline`** — the seventh and last memory subcommand, with
  `--project-id` (required), `--data-dir`, `--limit <1-100>` (default 20),
  `--before-sequence`, `--category`, `--kind`, `--json`, `--markdown`, and
  `--help` / `-h`. Read-only: no `--apply` exists. Exits `0` on success and `2`
  on any usage error, writes stdout only on success, ends with exactly one
  newline, is byte-identical across repeated runs, and needs no project root or
  project config. Markdown groups events by capture under fixed headings and
  invents no summary.
- **`project_timeline` MCP tool** — the twelfth and last read-only stdio tool,
  appended after the existing eleven. Declares `readOnlyHint: true` and
  `destructiveHint: false`, and lazy-loads the memory dependency on its own path
  only, exactly as `project_changes` does.

### Changed

- **Release profile promoted to v0.4** — release line `v0.4`, profile
  `project-brain-timeline`, twelve MCP tools, seven memory subcommands,
  `mcpReadTools: 2`, `mcpWriteTools: 0`, schema `1`, store format `2`,
  `storeMigrationRequired: false`, `timelinePersistence: false`.
- **Every release verifier is profile-aware** — the bundle verifier, install core
  and installed-release checker resolve the surface from the artifact's own
  declared profile and still fail closed on an unknown one, so the historical
  v0.2 (ten-tool) and v0.3 (eleven-tool) surfaces remain resolvable by one
  installer.
- **Installed MCP configuration output** now truthfully declares twelve read-only
  tools and lists `project_timeline`.
- **Installed qualification extended in place** rather than duplicated: the
  existing harness became profile-aware and gained `timeline-cli`,
  `timeline-mcp` and `v0.3.1-compatibility` sections. The continuous
  qualification workflow is now `v0.4-installed-qualification.yml` and pins the
  expected profile.
- **Source version promoted** `0.3.1` → `0.4.0` across `version.json`, every
  workspace manifest, the runtime version constants, and the Rust/WASM Kernel.

### Unchanged

- Project Brain schema stays `1`; Project Memory store format stays `2`; **no
  migration is required**, and a v0.3.1-shaped store is never migrated, backed
  up, or reported as `migrationRequired`.
- The six existing memory subcommands and eleven existing MCP tools keep their
  exact names, options, output shapes, registration order and exit codes.
- MCP stays **stdio only** with **zero** write tools.
- No project file is written and no project content is uploaded.
- No automatic capture, watcher, scheduler, cloud sync, telemetry, dashboard, web
  UI, semantic or vector search, LLM-generated summary, new provider, provider
  alias or profile, and no registry publication.

### Fixed

- `tools/validate-structure.mjs` now registers the tracked `assets/` media folder
  (public documentation images only). It had been tracked without registration
  since the README hero image landed, which failed `pnpm validate`.

## [0.3.1] - 2026-07-30

Stable patch release for the v0.3 line: two CLI usability improvements and
nothing else. It fixes Issues #2 and #3. There is **no schema, store-format, or
MCP capability change**, and no behavior change to any existing command.
`v0.3.0` remains immutable and unchanged. No registry publication; all workspace
packages remain private.

### Added

- **Conventional CLI help (Issue #2)** — `oh-my-pm --help` and `oh-my-pm -h`
  print bounded, deterministic help to stdout and exit `0`, writing nothing to
  stderr and ending with exactly one newline. Help lists the real current
  commands and namespaces, short usage examples, the output modes, and the
  controlled exit-code meanings. Namespace and command help uses the same form,
  including `oh-my-pm memory --help` and `oh-my-pm providers --help`. Help
  performs no network access, creates no file or application-data directory, and
  reads no token. Added without replacing the existing parser and without a CLI
  framework; no shell completion, prompts, manpages, colors, paging, analytics,
  or localization.
- **Installed MCP client configuration (Issue #3)** — `oh-my-pm mcp-config`
  prints a generic stdio MCP client configuration for the installed MCP server,
  supporting `--json` (default), `--markdown`, `--name <name>`, and `--help` /
  `-h`. It resolves the installed sibling `oh-my-pm-mcp` executable from the
  actual installed location, so installed users never pass `--prefix`, and emits
  an absolute command path with `args: []`. It works on POSIX and Windows
  (including the `.cmd` shim) and follows a relocated prefix instead of embedding
  an install-time path. It writes no client file and no project file, performs no
  network access, and includes no token, credential, environment value, project
  root, provider response, or hidden state. Invalid arguments and a missing
  installed executable are controlled exit `2`. Markdown output describes exactly
  the eleven read-only tools, including `project_changes`.
- Release notes (`docs/releases/v0.3.1.md`).
- Focused CLI tests for both surfaces (`cli/test/help.test.ts`,
  `cli/test/mcp-config.test.ts`).

### Changed

- `tools/print-mcp-client-config.mjs` now reuses the shared CLI config-generation
  module instead of carrying its own copy, so the repository helper and the
  installed command cannot diverge. It keeps its explicit `--prefix` for
  repository tooling only.
- `tools/check-v0.3-installed-project-brain.mjs` extends the existing installed
  qualification in place (rather than adding a competing suite) to cover
  installed help, installed `mcp-config`, and prefix relocation.
- `.github/workflows/release-v0.3.yml` retargeted to the exact version `0.3.1`,
  gating on the immutable base stable tag `v0.3.0` resolving to its exact
  published commit. All manual gates are unchanged: `workflow_dispatch` only,
  `main` only, exact confirmation `RELEASE v0.3.1`, protected `github-release`
  environment, cross-platform installed qualification, `--latest`, never
  `--prerelease`, and no registry publication.
- Canonical version promoted from `0.3.0` to `0.3.1` across `version.json`, every
  workspace package manifest, the runtime version constants, and the Rust Kernel.

### Unchanged

- Project Brain schema `1`; Project Memory store format `2`.
- Exactly eleven read-only MCP tools in the same fixed registration order; zero
  MCP write tools; stdio only.
- Exactly six memory subcommands.
- Node.js 20+ installed runtime baseline.
- The immutable `v0.1.0`, `v0.2.0-rc.1`, `v0.2.0`, `v0.3.0-rc.1`, and `v0.3.0`
  releases.

## [0.3.0] - 2026-07-27

Stable **Project Brain** foundation for the v0.3 line — the validated promotion
of the `v0.3.0-rc.1` prerelease. **`v0.3.0` is published** as the latest stable
GitHub Release (tag `v0.3.0` targeting `0d6f9b1…`, non-draft, non-prerelease,
marked latest, exactly three assets, no registry publication) through the
manually gated `Release v0.3 Stable` workflow after a separate, explicit owner
authorization. It supersedes `v0.2.0` as the latest stable release. `v0.3.0-rc.1`
remains the published prerelease.

No product behavior changed relative to the validated `v0.3.0-rc.1`; only the
version string moved from `0.3.0-rc.1` to `0.3.0`.

### Added

- Post-publication validation report for `v0.3.0-rc.1`
  (`docs/releases/v0.3.0-rc.1-post-publication-validation.md`) recording the
  `GO FOR v0.3.0 STABLE PREPARATION` decision from the published public assets.
- Stable release notes (`docs/releases/v0.3.0.md`), the stable publishing runbook
  (`docs/releases/publishing-v0.3.0.md`), the stable installed getting-started
  guide (`docs/v0.3/getting-started-installed.md`), and the Phase 7 report.
- `.github/workflows/release-v0.3.yml` — a manually gated, `workflow_dispatch`-only
  stable release workflow (prerelease never; `--latest`; protected
  `github-release` environment; cross-platform installed-qualification gate). It
  published `v0.3.0` as the latest stable release.

### Changed

- Promoted the canonical source version `0.3.0-rc.1 → 0.3.0` across all version
  surfaces (packaging/generated/version-metadata only; no product semantics
  change), and corrected public documentation to reflect the published
  `v0.3.0-rc.1` prerelease and the published latest stable `v0.3.0`.

## [0.3.0-rc.1] - 2026-07-26

Release candidate for the v0.3 **Project Brain** line, **published** as a
non-draft GitHub **prerelease** (tag `v0.3.0-rc.1` targeting `1db4057…`, not
marked latest, exactly three assets, no registry publication) through the
manually gated `Release v0.3 RC` workflow after a separate explicit owner
authorization. It does not supersede the published stable `v0.2.0`.

Phase 6 packages the already-approved Project Brain slice (local Markdown
capture, minimized evidence, deterministic snapshots/changes, capture-order
history, preview-first `memory` CLI with `capture`/`changes`/`status`/`history`/
`export`/`delete`, explicit `v1 → v2` store migration, and the read-only
`project_changes` MCP tool) into a self-contained, cross-platform artifact. No
product behavior changed relative to the source at Phase 5.

### Added

- An explicit, self-describing "project-brain" release profile in `RELEASE.json`
  (`releaseLine`, `bundleProfile`, `expectedMcpToolCount`, `projectBrain`),
  driving profile-aware, fail-closed bundle/install verifiers. The historical
  v0.2 profile still resolves the ten-tool surface.
- The self-contained v0.3 bundle now ships `@oh-my-pm/project-memory` (dist-only),
  so the **installed** CLI memory commands and the **installed** MCP
  `project_changes` tool resolve without a workspace checkout; the installed MCP
  exposes eleven tools.
- `tools/check-v0.3-installed-project-brain.mjs` — a cross-platform installed
  Project Brain qualification (full CLI + MCP journey, migration, corruption,
  concurrency, planted-sentinel privacy audit, source-independence).
- `.github/workflows/v0.3-installed-qualification.yml` — non-publishing
  cross-platform CI (one prepared artifact tested on Ubuntu/macOS/Windows).
- `.github/workflows/release-v0.3-rc.yml` — manually gated, prerelease-only RC
  workflow (not dispatched).
- RC release notes, publishing runbook, the installed getting-started guide, and
  the Phase 6 report.

### Changed

- `@oh-my-pm/project-memory` moved from a dev to a runtime dependency of
  `@oh-my-pm/cli` and `@oh-my-pm/mcp-server` (both reach it via a lazy dynamic
  import). Packaging-only; no external dependency added.

## [0.2.0] - 2026-07-25

Stable `v0.2.0`, consolidating the validated `v0.2.0-rc.1` release candidate.
Published as the latest stable GitHub Release (tag `v0.2.0` at
`2bac37a…`, `draft=false`, `prerelease=false`, marked latest, exactly three
assets, no registry publication) through the manually gated `Release v0.2 Stable`
workflow after a separate explicit owner approval. No feature, command, provider,
Skill, MCP tool, Kernel, extraction, installer, archive, or runtime behavior
changed relative to `v0.2.0-rc.1` — only the version string moved from
`0.2.0-rc.1` to `0.2.0`. The release line is closed and `v0.2.x` is
maintenance-only.

### Added

- Read-only, explicitly opt-in GitHub provider for repository metadata, issues,
  and pull requests: `GET`-only against a fixed `api.github.com` origin, fixed
  REST API version, single page per request, optional environment-only token.
- GitHub-backed `brief`, `risks`, `next`, and `handoff` workflows in the CLI
  (`github …`) and MCP (`github_project_*`).
- Six explicit GitHub source modes: `overview`, `repository`, `issues`,
  `pull-requests`, a single `item` (issue/PR with type auto-detection), and
  repository-scoped `search`, each with `open`/`closed`/`all` state and search
  `kind` filtering.
- Bounded, default-disabled GitHub item comments for the `item` source
  (`--include-comments`/`--comment-limit`, and `includeComments`/`commentLimit`
  in MCP): one page of at most 50 ordinary issue/PR conversation comments.
- Bounded, default-disabled pull-request review submissions and inline review
  comments for a pull-request `item` (`--include-reviews`/`--review-limit`,
  `--include-review-comments`/`--review-comment-limit`, and the corresponding
  MCP options): one page of at most 20 each.
- Source-aware, line-level deterministic risk, next-task, and decision
  extraction for Markdown and GitHub context, with English and Persian headings
  and markers.
- Strict read-only provider configuration (`providers.json`) with optional
  GitHub defaults and enable/disable control; offline `providers status` and an
  explicitly confirmed `providers doctor` diagnostic.
- MCP `provider_status` and `github_provider_diagnostics` tools, for an exact
  ten-tool stdio surface.
- Portable release bundles ship a preview-first self-installer that creates a
  versioned, source-independent, relocatable local installation under an
  explicit prefix.

### Changed

- GitHub CLI and MCP workflows route through a single strict source-selection
  model while preserving the default `overview` + `open` behavior.
- Provider, Runtime, CLI, and MCP execution boundaries are asynchronous to
  support real read-only network providers; local workflows stay offline.
- Risk and next-task output includes optional public provenance, ownership,
  due-date, and priority metadata; GitHub item summaries report sanitized review
  and review-comment metadata without exposing bodies, diff hunks, or commit
  identifiers.
- Live GitHub CLI and MCP workflows read the current time once at the
  process/tool-call boundary; local workflows keep a fixed deterministic clock.
- Centralized the GitHub list limit constants (minimum 1, default 50, maximum 100) into one canonical source; behavior-preserving.
- Generalized version, bundle, and archive verification around self-describing
  metadata.

### Hardening and validation

- Cross-platform release-install CI parity: the Windows release-install job
  (like the POSIX job) verifies a release installation survives deleting the
  extracted source bundle and moving the complete installed prefix, re-running
  the installed CLI and read-only installed-state verification (which exercises
  the installed MCP) after each operation.
- Controlled, read-only live GitHub smoke through the installed portable
  artifact: tokenless provider/CLI flows and the installed stdio MCP live
  workflows (all four GitHub tools, exact ten-tool order) passed with bounded,
  sanitized projections and no forbidden discussion data.
- Post-publication validation of the published `v0.2.0-rc.1` prerelease from its
  public assets passed with no Blocker/High/Medium defects and a GO decision for
  stable preparation.

### Fixed

- Portable release bundle assembly stages the complete generated Kernel binding
  consistently across Windows and POSIX, closing a Windows-only packaging gap
  where the generated Node WASM glue file was omitted.
- Release installation verification is platform-aware: POSIX executable-mode
  bits are required on Linux and macOS but not on Windows, so Windows installs
  no longer fail with `post_install_verification_failed`.
- The read-only installed-state verifier launches the installed runtime safely
  on Windows by invoking the `.mjs` entrypoints directly with the Node
  executable (no shell), while POSIX continues to use the installed shims.

### Security and privacy

- No project file writes; no context upload; no telemetry; stdio-only MCP
  transport; no HTTP MCP transport.
- GitHub access is explicit, read-only, and `GET`-only; the optional token is
  environment-only and never printed, persisted, or accepted as an argument.
- No raw comment/review/review-comment bodies, diff hunks, or commit identifiers
  are exposed through the MCP projections.
- All packages remain private; no registry publication.

### Known non-blocking follow-ups

- L1 — no conventional CLI `--help` surface (deferred beyond `v0.2.0`).
- L2 — no installed MCP client-config generator (deferred to distribution/UX).
- L3 — `github-release` environment required-reviewer governance (closed:
  the reviewer gate was exercised for the stable publication run, no
  administrator bypass).
- L4 — stale fixture-path reference corrected in current operational
  documentation to the shipped path `examples/markdown-project`.

## [0.2.0-rc.1] - 2026-07-24

First `v0.2` release candidate. Prepared on `main` and subsequently published as
an immutable GitHub prerelease (tag `v0.2.0-rc.1`, `draft=false`,
`prerelease=true`); the latest stable release remained `v0.1.0` and no registry
artifact was published.

### Added

- Explicit, bounded pull-request review submissions and inline review comments for GitHub item workflows in CLI and MCP (`--include-reviews` / `--review-limit` and `--include-review-comments` / `--review-comment-limit`, and `includeReviews` / `reviewLimit` / `includeReviewComments` / `reviewCommentLimit` for the MCP GitHub tools). Disabled by default, available only for the `item` source and only when the item is a pull request, one page of at most 20 each, and never fetching timeline events, thread resolution, reactions, diffs, files, or commits. See [docs/providers/github-pr-reviews.md](docs/providers/github-pr-reviews.md).
- Deterministic review-state and explicit Markdown-derived risk, task, and handoff signals.
- Optional, bounded GitHub item comments: the `item` source can now include an issue or pull request's ordinary conversation comments (`--include-comments` / `--comment-limit`, and `includeComments` / `commentLimit` for the MCP GitHub tools). Comments are disabled by default, limited to one page of at most 50, and only ordinary issue/PR comments are fetched — never review comments, reviews, timeline events, or diffs. See [docs/providers/github-item-comments.md](docs/providers/github-item-comments.md).
- Portable release bundles now contain a preview-first self-installer that creates a versioned, source-independent local installation under an explicit prefix.
- A strictly read-only, explicitly opt-in GitHub provider for repository metadata, issues, and pull requests.
- GitHub-backed brief, risks, next, and handoff workflows in CLI and MCP.
- Source-aware, line-level deterministic risk extraction for Markdown and GitHub context.
- Deterministic next-task extraction from Markdown action structures and actionable GitHub issues/pull requests.
- English and Persian project-signal headings and markers.
- Strict read-only provider configuration with optional GitHub defaults and enable/disable control.
- Offline provider status/doctor commands and explicitly confirmed GitHub access diagnostics.
- MCP provider status and GitHub diagnostic tools.
- Explicit GitHub source selection for repository overview, repository-only, issues, pull requests, one specific item, and repository-scoped search.
- GitHub workflow state selection for open, closed, or all items.
- Configurable default GitHub source and state.

### Changed

- GitHub item source summaries now report sanitized review and review-comment metadata without exposing bodies, diff hunks, or commit identifiers.
- Opened the `0.2.0-alpha.0` development line.
- GitHub CLI and MCP workflows now route through a single strict source-selection model while preserving the existing overview/open behavior by default.
- Generalized version, bundle, and archive verification around self-describing metadata.
- Provider, Runtime, CLI, and MCP execution boundaries are asynchronous to support real read-only network providers.
- Runtime preserves selected provider provenance for Skill execution without passing raw provider data.
- Risk and next-task output includes optional public provenance, ownership, due-date, and priority metadata.
- GitHub CLI and MCP workflows may resolve repository and limit defaults from provider configuration.
- Live GitHub CLI and MCP workflows read the current time once at the process/tool-call boundary so overdue classification stays correct; local workflows keep a fixed deterministic clock.
- Centralized the GitHub list limit constants (minimum 1, default 50, maximum 100) into one canonical source imported by provider configuration, effective settings, the source-selection resolver, and the CLI parser; the `DEFAULT_GITHUB_PROVIDER_LIMIT` and `GITHUB_CLI_DEFAULT_LIMIT` compatibility aliases are retained. Behavior-preserving; no numeric value, flag, error, or schema changed.

### Hardening and validation

- Cross-platform release-install CI parity: the Windows release-install job (like the POSIX job) verifies that a release installation survives deleting the extracted source bundle and moving the complete installed prefix, re-running the installed CLI and read-only installed-state verification (which exercises the installed MCP) after each operation.
- Controlled, read-only live GitHub smoke through the installed portable artifact: the tokenless provider/CLI flows (status, doctor, repository, issues, search, and a bounded live pull-request discussion) and the installed stdio MCP live workflows (all four GitHub tools, exact ten-tool order) passed with bounded, sanitized projections and no forbidden discussion data (no bodies, diff hunks, or commit identifiers). The authenticated smoke was not run because no token was available.

### Fixed

- Portable release bundle assembly now stages the complete generated Kernel binding consistently across Windows and POSIX environments.
- Windows release installation no longer fails because the generated Node WASM glue file is omitted by deployment packaging.
- Release installation verification is now platform-aware: because the installer intentionally does not set POSIX executable-mode bits on Windows, exact-state detection and post-install verification no longer require those bits on Windows, while still requiring them on Linux and macOS. Bundle-content and checksum verification, the exact four-shim content check, the transactional apply, and rollback are all unchanged. Windows installs no longer fail with `post_install_verification_failed`.
- The read-only installed-state verifier now launches the installed runtime safely on Windows. Because the Windows shims are `.cmd` files that Node cannot spawn without a shell, the verifier launches the installed CLI and MCP `.mjs` entrypoints directly with the Node executable as an argument vector (no shell, no constructed command string), while POSIX continues to use the installed executable shims. The four shims remain validated byte-for-byte and the direct `.cmd` status smoke is retained. Installed-state verification no longer fails on Windows.

## 0.1.0

### Added

- Local read-only Markdown project brief workflow
- Deterministic project risk extraction
- Unchecked Markdown next-task extraction
- Deterministic project handoff generation
- Root-level project document configuration with include/exclude rules
- Local stdio MCP server with four read-only tools
- Preview-first repository-local installation and verification
- Portable versioned release bundle assembly and verification
- Deterministic `tar.gz` and `zip` release archives with reproducible SHA-256 checksums
- Repository-independent release archive verification and reproducibility checks
- Manually gated GitHub Release workflow prepared (not yet published)

### Safety and privacy

- No project file writes
- No context upload
- No telemetry
- No HTTP MCP transport
- No external provider integration in v0.1.0

[Unreleased]: https://github.com/he8um/oh-my-pm/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/he8um/oh-my-pm/compare/v0.1.0...v0.2.0
[0.2.0-rc.1]: https://github.com/he8um/oh-my-pm/compare/v0.1.0...v0.2.0-rc.1
