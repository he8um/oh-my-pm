# @oh-my-pm/cli

Private CLI package for OH MY PM.

The package exposes side-effect-free CLI core utilities and a local Node.js wrapper.

The local wrapper is available as `oh-my-pm` inside the workspace after packages are built and linked by pnpm. It is private and is not published.

After a local installation (see [the getting-started guide](../docs/getting-started.md)), the same commands are available through the installed `oh-my-pm` shim once `<prefix>/bin` is on PATH:

```bash
oh-my-pm brief ./project --markdown
oh-my-pm risks ./project --markdown
oh-my-pm next ./project --markdown
oh-my-pm handoff ./project --markdown
```

For development inside the repository, invoke the wrapper directly with `node cli/bin/oh-my-pm.mjs <command>` as shown in the examples below.

Current commands:

- `status`
- `doctor`
- `plan <request>`
- `brief [root]`
- `risks [root]`
- `next [root]`
- `handoff [root]`
- `github <brief|risks|next|handoff> [owner/repo] [--source <mode>] [--state <open|closed|all>] [--number <n>] [--query <text>] [--kind <all|issues|pull-requests>] [--limit <1..100>] [--provider-config <path>]`
- `providers status [--provider-config <path>]`
- `providers doctor [github [owner/repo]] [--provider-config <path>] [--confirm-network]`
- `install-preview <root>`

`brief [root]` reads Markdown project documents from a local directory and produces a project status brief through the Runtime, Planner, Skills, and the real WASM Kernel binding. The root defaults to `.` when omitted. Files ending in `.md` or `.markdown` (case-insensitive) are loaded recursively; `.git`, `.hg`, `.svn`, `node_modules`, `dist`, `build`, `coverage`, `target`, `.next`, `.turbo`, and `.cache` directories are ignored anywhere in the tree; symbolic links are never followed and nothing outside the requested root is read. Deterministic limits apply: at most 200 files, 256 KiB per file, and 2 MiB in total. The command is read-only — it never modifies project files, never persists or transmits document content, and requires no external integration. Examples:

```bash
node cli/bin/oh-my-pm.mjs brief
node cli/bin/oh-my-pm.mjs brief ./my-project
node cli/bin/oh-my-pm.mjs brief examples/fixtures/markdown-project --json
node cli/bin/oh-my-pm.mjs brief examples/fixtures/markdown-project --markdown
```

`risks [root]` reads the same Markdown project documents with the same loader, limits, ignored directories, and read-only guarantees as `brief`, and produces a project risk report through the Runtime, Planner, the `extractRisks` skill, and the real WASM Kernel binding. The root defaults to `.` when omitted; brief, JSON, and Markdown output modes are supported. Detection is deterministic and **line-level**: each risk is the actual list item or explicit marker under a recognized risk heading (English or Persian), never a document-title collapse. Blocker headings/markers map to high severity, risk and dependency to medium, concerns and known issues to low. Checked (resolved) items and fenced code are excluded, and false-positive guards apply (`unblocked` is not `blocked`). Output may carry optional `owner`, `due`, and (for GitHub) `url`/`repository`/`number` metadata. No LLM, no fuzzy matcher, no network, no writes. Examples:

```bash
node cli/bin/oh-my-pm.mjs risks
node cli/bin/oh-my-pm.mjs risks ./my-project
node cli/bin/oh-my-pm.mjs risks examples/fixtures/markdown-project --json
node cli/bin/oh-my-pm.mjs risks examples/fixtures/markdown-project --markdown
```

`next [root]` reads the same Markdown project documents with the same loader, limits, and read-only guarantees as `brief` and `risks`, and derives next tasks through the Runtime, Planner, the `deriveNextTasks` skill, and the real WASM Kernel binding. The root defaults to `.` when omitted; brief, JSON, and Markdown output modes are supported. Tasks come from unchecked Markdown checklist items (`- [ ]`, `* [ ]`, `+ [ ]`), list items under recognized action headings (`next steps`, `action items`, `tasks`, `todo`, and Persian equivalents), and explicit action markers (`Action:`, `Todo:`, `اقدام:`, …), in document and line order. A leading priority marker (`[P0]`, `Critical:`, `بحرانی:`, …) is stripped from the title and recorded as `priority`. Checked items are ignored, risk-section items and arbitrary prose never become tasks, duplicate task text is deduped, and at most ten tasks are returned. No LLM, no network, no writes. Examples:

```bash
node cli/bin/oh-my-pm.mjs next
node cli/bin/oh-my-pm.mjs next ./my-project
node cli/bin/oh-my-pm.mjs next examples/fixtures/markdown-project --json
node cli/bin/oh-my-pm.mjs next examples/fixtures/markdown-project --markdown
```

`handoff [root]` reads the same Markdown project documents with the same loader, limits, ignored directories, and read-only guarantees as `brief`, `risks`, and `next`, and assembles a deterministic project handoff through the Runtime, Planner, the `createHandoff` skill, and the real WASM Kernel binding. The root defaults to `.` when omitted; brief, JSON, and Markdown output modes are supported. The handoff always contains four sections in a fixed order — Summary, Open Tasks, Risks, and Decisions — plus the project title (inferred from the first document) and the deterministic generation timestamp supplied by the Runtime. Section content comes from exact, normalized Markdown headings: Summary reads `summary`, `overview`, `current objective`, `objective`, `active`, `current status`, and `next milestone`; Risks read `risk`, `risks`, `blocked`, `blocker`, `blockers`, `constraint`, `constraints`, and `delivery constraints`; Decisions read `decision`, `decisions`, and `decision log`. Open Tasks are the unchecked single-line Markdown checkboxes (`- [ ]`, `* [ ]`, `+ [ ]`); checked boxes (`- [x]`, `- [X]`) are excluded and plain document titles never become tasks. Each section is capped at five items, deduplicated in first-occurrence order. No LLM, no network, no writes. Examples:

```bash
node cli/bin/oh-my-pm.mjs handoff
node cli/bin/oh-my-pm.mjs handoff ./my-project
node cli/bin/oh-my-pm.mjs handoff examples/fixtures/markdown-project --json
node cli/bin/oh-my-pm.mjs handoff examples/fixtures/markdown-project --markdown
```

`github <brief|risks|next|handoff> [owner/repo] [--limit <1..100>] [--provider-config <path>] [--json|--markdown]` runs the same four workflows against a GitHub repository through the strictly read-only GitHub provider. Unlike the local workflows, this command reaches the network — and only when invoked: it issues `GET`-only requests to `api.github.com` (REST API version `2026-03-10`) for repository metadata, open issues, and pull requests, normalizes them, and feeds them through the same Runtime, Planner, Skills, and WASM Kernel pipeline. The repository must be a bare `owner/repository` (URLs, `.git` suffixes, and path traversal are rejected). The repository and `--limit` are optional at parse time because provider configuration may supply a `defaultRepository` and `defaultLimit`; explicit values always override configuration, and `--limit` accepts `1..100` and defaults to `50`. Authentication is optional: public repositories work without a token, and a token is supplied only through the `OH_MY_PM_GITHUB_TOKEN` environment variable — there is no `--token` argument, and the token is never printed or persisted. The provider never writes to GitHub. See [the GitHub provider guide](../docs/providers/github.md). Examples:

```bash
oh-my-pm github brief owner/repository --markdown
oh-my-pm github risks owner/repository --limit 25 --json
oh-my-pm github risks --markdown   # uses providers.json defaultRepository
```

## GitHub source selection

`--source` chooses which read-only GitHub context is analyzed; the default is `overview` (repository metadata plus open issues/PRs). Options that do not apply to the selected source are rejected before any network access.

| source          | state | limit | number | query | kind |
| --------------- | ----- | ----- | ------ | ----- | ---- |
| overview        | yes   | yes   | no     | no    | no   |
| repository      | no    | no    | no     | no    | no   |
| issues          | yes   | yes   | no     | no    | no   |
| pull-requests   | yes   | yes   | no     | no    | no   |
| item            | no    | no    | yes    | no    | no   |
| search          | yes   | yes   | no     | yes   | yes  |

```bash
oh-my-pm github brief owner/repository --source repository --markdown
oh-my-pm github risks owner/repository --source issues --state open --limit 50 --markdown
oh-my-pm github handoff owner/repository --source pull-requests --state closed --limit 25 --markdown
oh-my-pm github brief owner/repository --source item --number 123 --markdown
oh-my-pm github risks owner/repository --source search --query "release blocker" --kind all --state open --markdown
```

`item` auto-detects issue vs. pull request. Search terms cannot override the provider-injected repository/state/kind scope. Provider configuration may set `defaultSource` and `defaultState`; explicit CLI values always override them. See [GitHub source selection](../docs/providers/github-source-selection.md).

## Provider configuration and diagnostics

The `github` and `providers` commands read an optional, strictly read-only provider configuration file (`providers.json`). OH MY PM never writes it. It supplies GitHub `enabled`/`defaultRepository`/`defaultLimit` defaults only; no secret is ever permitted, and the origin, API version, method, and token environment variable stay fixed. The location resolves in precedence order: `--provider-config <path>`, `OH_MY_PM_PROVIDER_CONFIG`, `$XDG_CONFIG_HOME/oh-my-pm/providers.json`, `~/.config/oh-my-pm/providers.json`, `%APPDATA%\oh-my-pm\providers.json`, then built-in defaults. Local commands never read provider configuration and reject `--provider-config`.

- `providers status` inspects the resolved provider state offline (no network) and reports token presence only.
- `providers doctor` runs all offline provider checks (no network).
- `providers doctor github [owner/repo] --confirm-network` runs the offline checks first, then performs exactly one read-only `GET` repository-metadata request. The network is touched only with the explicit `--confirm-network` flag.

Diagnostics never print a token value, a raw provider response, an absolute config path, or raw configuration text. See [provider configuration](../docs/providers/configuration.md) and [provider diagnostics](../docs/providers/diagnostics.md). Examples:

```bash
oh-my-pm providers status --markdown
oh-my-pm providers doctor --markdown
oh-my-pm providers doctor github he8um/oh-my-pm --confirm-network --markdown
```

## Local project configuration

The `brief`, `risks`, `next`, and `handoff` workflows all read an optional root-level configuration file to decide which Markdown documents are analyzed:

- filename: `oh-my-pm.config.json`
- discovery: only `<project-root>/oh-my-pm.config.json` is considered; there is no upward search
- format: JSON only; configuration is optional and an absent config preserves current behavior
- an invalid config exits with code `2` before the Runtime executes

The `documents` object accepts `include` and `exclude` glob lists plus `maxFiles`, `maxBytesPerFile`, and `maxTotalBytes`. Supported glob operators are `*` (zero or more non-slash characters), `?` (exactly one non-slash character), and `**` (across path segments, including zero). Rules are:

- default include patterns are `**/*.md` and `**/*.markdown`; the default exclude list is empty
- a document is selected when it matches at least one include pattern and no exclude pattern — exclude precedence always wins
- matching is case-sensitive (the Markdown extension gate in the loader stays case-insensitive)
- safety limits may only be lowered relative to the loader defaults (200 files, 256 KiB per file, 2 MiB total); a value above the default is rejected
- patterns must be relative POSIX paths — absolute paths, drive prefixes, backslashes, `..` segments, a leading `./`, and `!` negation are rejected
- hard ignored directories (for example `.git`, `node_modules`, `dist`) can never be re-enabled

Example config:

```json
{
  "version": 1,
  "documents": {
    "include": ["README.md", "docs/**/*.md"],
    "exclude": ["docs/archive/**"],
    "maxFiles": 100,
    "maxBytesPerFile": 131072,
    "maxTotalBytes": 1048576
  }
}
```

```bash
node cli/bin/oh-my-pm.mjs brief ./my-project
node cli/bin/oh-my-pm.mjs handoff ./my-project --markdown
```

The configuration is read-only: it never enables filesystem writes, never executes code, never reads environment variables, and never reaches outside the selected project root.

The MCP server (`@oh-my-pm/mcp-server`) exposes eight tools over stdio: the four local project workflows — `project_brief`, `project_risks`, `project_next`, `project_handoff` — using the same `oh-my-pm.config.json` rules and Markdown document selection as these CLI commands, plus the four read-only GitHub tools — `github_project_brief`, `github_project_risks`, `github_project_next`, `github_project_handoff` — which mirror the `github` CLI command.

`install-preview` is dry-run only. It reads the target root through the installer read-only adapter and prints planned operations. It does not write files and it does not execute installation. The preview may include an archive plan summary (planned name, format, checksum, entry count), a signed release metadata summary, a release integrity summary, and a local channel metadata summary, but it still creates no archive, includes no signature value, performs no real signing, verifies no real signatures, and exposes no publishing or download URLs — the integrity verdict is a consistency check only and the channel metadata is local-only. It may also include a local update policy summary (an eligibility decision only) an update impact summary (a create/replace/remove/unchanged comparison only), and a rollback impact summary (a restore/remove/missing/unchanged comparison only); it never executes an update or a rollback. The preview may also include an installer decision report that aggregates every local preview layer into one ready/blocked/review-required verdict, but it still does not execute install or rollback. It may also include an installer audit event summary that models the preview pipeline as a deterministic in-memory event sequence; those events are counted only and are never logged, persisted, or sent. It may also include an audit export summary (format, event count, byte size, and a deterministic fingerprint); it does not include raw export content in JSON and does not persist or send events. It may also include a guarded write capability status (intent, mode, allowed, reasons) evaluated under the default preview-only policy; the CLI does not provide a production install command and never writes files, executes installation, or calls a write adapter. It may also include a deterministic, non-secret approval token summary (intent, decision, and a descriptive token value); the token does not bypass the preview-only default and carries no secret, key, or signature. It may also include a write execution plan summary (intent, planned step count, reasons) that describes the local write steps a future write mode would plan; the raw step list is not included in JSON, the plan is not executed, and no write adapter is called. It may also include a write confirmation summary (intent, passed/failed check counts, reasons) reporting pre-write readiness; the raw checklist items are not included in JSON, and the CLI still does not provide a production install command. It may also include a write adapter contract status (name, required and declared capabilities, reasons) validating a declared adapter metadata contract; no adapter object or method is included, no adapter is called, and the CLI still does not provide a production install command. It may also include a controlled write dry-run readiness summary (intent, per-layer readiness flags, planned step count, reasons) aggregating every write readiness layer; the raw pass-through layers are not included in JSON, nothing is executed, and the CLI still does not provide a production install command. It may also include a release readiness summary (status, per-status section counts, unique reason count, planned step count, reasons) aggregating the decision report, audit trail export dry-run, and controlled write dry-run envelope; the raw sections and markdown are not included in JSON, no release artifact is created, and the CLI still does not provide a production install command. It may also include a v0 release candidate checklist summary (item count, passed/failed counts, reasons) evaluating whether the repository is a v0 candidate; the raw checklist items and markdown are not included in JSON, no release is created, and the CLI still does not provide a production install command. It may also include a public v0 release notes draft summary (version, draft status, section count, reasons) rendered from the checklist and release-readiness reports; the raw draft sections and markdown are not included in JSON, no GitHub release, tag, or artifact is created, and the CLI still does not provide a production install command. It may also include a guarded release artifact plan summary (version, planned/blocked/total item counts, creationAllowed, reasons) reporting which release outputs would be planned; `creationAllowed` is always false, the raw items and markdown are not included in JSON, no release artifact, archive, tag, or GitHub release is created, and the CLI still does not provide a production install command. It may also include a guarded local artifact assembly readiness summary (version, per-layer readiness flags, creationAllowed, reasons) aggregating the release artifact plan and the package assembly, archive, metadata, integrity, and channel dry-runs; `creationAllowed` is always false, the raw envelope and pass-through reports are not included in JSON, nothing is created, and the CLI still does not provide a production install command. It may also include a guarded artifact creation permission summary (version, mode, allowed, creationAllowed, reasons) evaluated under the default dry-run-only policy without approval; permission is never granted in the preview, `creationAllowed` is always false, the raw assembly envelope and markdown are not included in JSON, nothing is created, and the CLI still does not provide a production install command. It may also include a local artifact creation execution plan summary (version, permission/assembly readiness, planned/blocked/total step counts, creationAllowed, reasons) sequencing the steps a future explicitly-enabled phase would take; no step is executed, `creationAllowed` is always false, the raw steps and markdown are not included in JSON, nothing is created, and the CLI still does not provide a production install command. It may also include a local artifact creation adapter contract status (name, required and declared capability labels, creationAllowed, reasons) validating a declared metadata-only contract against the execution plan; no adapter instance or method is included or called, `creationAllowed` is always false, the markdown is not included in JSON, nothing is created, and the CLI still does not provide a production install command. It may also include a local artifact creation confirmation checklist summary (version, passed/failed/total item counts, creationAllowed, reasons) composing the permission report, execution plan, and adapter contract into one readiness confirmation; the checklist confirms readiness only and never implies an artifact was created — the raw checklist items and markdown are not included in JSON, no adapter is called, `creationAllowed` is always false, nothing is created, and the CLI still does not provide a production install command.

The wrapper uses the real WASM Kernel binding from `@oh-my-pm/kernel`, so validation, update guard, and state transition decisions come from the Rust Kernel. Provider seed data remains local. Build the workspace first so the generated binding exists:

```bash
pnpm build
```
