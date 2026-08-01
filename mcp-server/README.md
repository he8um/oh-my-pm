# @oh-my-pm/mcp-server

Private Model Context Protocol (MCP) server for OH MY PM.

The installed surface is exactly:

```text
12 read-only tools
0 write tools
stdio transport only
```

Four local Markdown project workflows (filesystem-only), four GitHub workflows
(read-only outbound API requests, only when called), two provider diagnostics
tools (offline, with one explicitly confirmed GitHub request), and two read-only
Project Brain memory tools. The package is private and is not published to npm.

The current v0.5 release bundle (profile `ohmypm-cli-namespace`) always packages
`@oh-my-pm/project-memory`, so an installed server always registers all twelve
tools. See [Conditional registration](#conditional-registration) for the
mechanism and the historical profiles where it mattered.

The server depends on [`@oh-my-pm/application`](../application/README.md) for
shared use cases. As of v0.5.1 it does **not** depend on `@oh-my-pm/cli`.

## Build requirement

Build the workspace first so the compiled server and the real WASM Kernel binding exist:

```bash
pnpm build
```

## Transport

The only transport is local **stdio**. There is no HTTP, SSE, host, port, network listener, authentication, or session. `stdout` is reserved for MCP protocol messages; a fatal startup error writes one concise line to `stderr` and exits non-zero. Project roots are loaded only when a tool is called — the server does no scanning at startup.

Start the server (development, from the repository):

```bash
node mcp-server/bin/ohmypm-mcp.mjs
```

After a local installation (see [the getting-started guide](../docs/getting-started.md)), the server is available through the installed command once `<prefix>/bin` is on PATH:

```bash
ohmypm-mcp
```

The former `oh-my-pm-mcp` name remains as a deprecated compatibility alias, so an existing client configuration keeps working without being edited. It prints a deprecation warning to stderr only -- never to stdout, which is reserved for MCP protocol messages. No removal is scheduled. See [the v0.5 migration guide](../docs/v0.5/README.md).

Generate a generic stdio client configuration for the installed command:

```bash
pnpm mcp:config -- --prefix "$HOME/.local" --markdown
```

The generator prints the configuration only — it never writes to or edits a client application. Copy the entry into your MCP client's configuration manually.

## Tools

All twelve tools, in exact registration order. MCP clients depend on both the
names and the order, so this list is a compatibility contract:

| #   | Tool                          | What it does                                                                                         |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `project_brief`               | deterministic project status brief from local Markdown                                               |
| 2   | `project_risks`               | line-level risk signals from recognized Markdown headings and markers                                |
| 3   | `project_next`                | next tasks from Markdown checklists, action headings, and markers                                    |
| 4   | `project_handoff`             | deterministic project handoff from local Markdown sections                                           |
| 5   | `github_project_brief`        | GitHub repository status brief                                                                       |
| 6   | `github_project_risks`        | GitHub repository risk signals                                                                       |
| 7   | `github_project_next`         | GitHub repository next tasks                                                                         |
| 8   | `github_project_handoff`      | GitHub repository handoff                                                                            |
| 9   | `provider_status`             | offline resolved provider state (no network)                                                         |
| 10  | `github_provider_diagnostics` | offline GitHub diagnostics, one confirmed GET when opted in                                          |
| 11  | `project_changes`             | read-only comparison of already-captured Project Brain memory, in authoritative capture order        |
| 12  | `project_timeline`            | read-only bounded timeline derived from adjacent committed snapshots, in authoritative capture order |

Tools 11 and 12 read already-captured local memory. Neither captures, migrates,
exports, deletes, or repairs memory, and neither performs a network request.

Every tool is annotated `readOnlyHint: true` and `destructiveHint: false`. There
are **zero** write tools: no tool creates, modifies, or deletes a project file,
mutates a GitHub resource, or writes Project Brain memory.

### Conditional registration

The first ten tools always register and always keep their exact order.
`project_changes` and `project_timeline` register only when the local Project
Memory capability resolves at stdio startup, through a lazy optional dynamic
import.

The current v0.5 bundle always ships `@oh-my-pm/project-memory`, so in every
installed v0.5 server all twelve register. The fallback exists for the
historical `source-v0.2` profile, which excluded Project Memory: there the
server starts with the exact ten and emits no warning. That fail-safe path is
still live code, which is why the mechanism is documented rather than removed.

| Profile                                     | Project Memory bundled | Tools |
| ------------------------------------------- | ---------------------- | ----- |
| `ohmypm-cli-namespace` (current, v0.5)      | yes                    | 12    |
| `project-brain-timeline` (v0.4, historical) | yes                    | 12    |
| `project-brain` (v0.3, historical)          | yes                    | 11    |
| `source-v0.2` (historical)                  | no                     | 10    |

Only the current row describes a release you can install today; the rest are
recorded so a verifier can resolve an older bundle fail-closed.

The four local tools accept a project root:

```json
{ "root": "./path/to/project" }
```

`root` defaults to `.`. Each local tool is filesystem-local, read-only, and Markdown-based, respects `oh-my-pm.config.json`, and never modifies files.

The four GitHub tools accept an optional repository, limit, and source-selection fields:

```json
{
  "repository": "owner/repository",
  "limit": 50,
  "source": "overview",
  "state": "open",
  "number": 123,
  "query": "release blocker",
  "kind": "all"
}
```

`repository`, `limit`, `source`, and `state` are optional: when omitted, the configured `providers.json` defaults are used (`defaultRepository`, `defaultLimit`, `defaultSource`, `defaultState`), and explicit values override them. `source` is one of `overview` (default), `repository`, `issues`, `pull-requests`, `item`, or `search`; `state` is `open`/`closed`/`all`; `number` is required by `item`; `query`/`kind` apply to `search`. `repository` must be a bare `owner/repository`; `limit` is `1..100` (default 50). The `item` source additionally accepts the bounded discussion options `includeComments`/`commentLimit` (`1..50`, default 20), and — only when the item is a pull request — `includeReviews`/`reviewLimit` and `includeReviewComments`/`reviewCommentLimit` (`1..20`, default 10 each); all are disabled by default. There is no token, API-URL, config-path, or local-root input, and user search terms can never override the injected repository/state/kind scope. The successful result adds a sanitized `selection` summary plus sanitized `sourceSummary` counts and bounded review/comment metadata (never a body, diff hunk, or commit id), and never includes the internal provider query or REST query string. Each GitHub tool is read-only. Server startup and `tools/list` make **no** GitHub request — a request happens only when a GitHub tool is called, over `GET`-only HTTPS to `api.github.com`, single page per endpoint, and never fetching timeline events, thread resolution, reactions, diffs, files, or commits. Supply the optional `OH_MY_PM_GITHUB_TOKEN` to the server process environment when needed; it is never accepted as a tool input and never included in output. See [the GitHub provider guide](../docs/providers/github.md) and [GitHub source selection](../docs/providers/github-source-selection.md).

The two provider diagnostics tools:

```json
{}
{ "repository": "owner/repository", "confirmNetwork": false }
```

`provider_status` takes no input, resolves provider configuration from the process environment or standard OS location (an agent can never supply a config path), reports token presence only, and never accesses the network. `github_provider_diagnostics` takes an optional `repository` (the configured default may be used) and an optional `confirmNetwork` (defaults to `false`); with `confirmNetwork: true` it performs exactly one read-only `GET` repository-metadata request. Neither accepts a token, config path, API URL, limit, or headers. See [provider configuration](../docs/providers/configuration.md) and [provider diagnostics](../docs/providers/diagnostics.md).

### `project_changes` (v0.3 Phase 5, read-only)

`project_changes` reads already-captured local Project Brain memory and compares committed snapshots in authoritative capture order. It does not capture or modify a project, does not migrate/export/delete/repair memory, and performs no network request. Its input is strict — a `projectId` plus an optional explicit `previousSnapshotId`/`currentSnapshotId` pair (both-or-neither, must differ), `staleAfterSeconds` (`0..31536000`, default 604800), and `limit` (`1..100`, default 50, bounds output only):

```json
{ "projectId": "my-project", "limit": 50 }
```

There is **no** `root`, `dataDir`, `path`, `token`, `provider`, `capture`, `apply`, `migrate`, or `force` input — the agent cannot choose a filesystem location, and the tool resolves the same standard application-data location the Project Memory adapter uses. The default comparison compares the latest committed capture with the capture committed immediately before it (Phase 4.1 capture chronology, never a lexical id order); an explicit pair is honored exactly. The result is a strict, versioned projection: `status` (`compared`/`noPriorMemory`/`insufficientHistory`), the compared snapshot ids, a `summary` with `totalChanges`/`returnedChanges`/`truncated` and complete twelve-category counts, and a bounded `changes` array of `{ category, itemKind, itemId, title?, previousStatus?, currentStatus?, previousSeverity?, currentSeverity?, previousDueDate?, currentDueDate?, evidenceCount }`. It never exposes raw `ProjectState`/`ProjectSnapshot`/`EvidenceRecord`, `previousValue`/`currentValue`, evidence ids, metadata, provenance, owner, priority, raw bodies, or paths — evidence is reported as a count only. `noPriorMemory` and `insufficientHistory` are controlled non-error statuses. See [phase-5-mcp.md](../docs/v0.3/phase-5-mcp.md).

### Success behavior

- `content` contains the human-readable Markdown, identical to the CLI's `--markdown` output for the same workflow.
- `structuredContent` contains a compact, public-safe projection: `operation`, `root` (the caller-provided value, never an absolute path), a small `documents` metadata object, and the strict `result` shape for the operation.

Risk and next-task results are line-level and may carry optional public provenance fields — `source`, `sourceType`, `url`, `owner`, `due`, `repository`, `number`, and (for next tasks) `priority`. The result never contains raw document bodies, raw provider responses, the internal runtime response, execution traces, absolute paths, filesystem handles, secrets, tokens, or adapter objects.

### Errors

Tool-level failures are returned as MCP tool errors (`isError: true`) with a concise `<code>: <message>` text and no stack trace or absolute path. Failure codes: `project_config_invalid`, `project_root_not_found`, `project_root_not_directory`, `project_documents_empty`, `project_runtime_failed`, `project_output_invalid`.

## Configuration and document selection

Each tool reuses the CLI's configured document loader: it reads only `<root>/oh-my-pm.config.json` when present (no upward search), applies the same include/exclude glob rules and file/byte limits, and loads the selected Markdown documents read-only. The same Runtime, Planner, Skills, provider registry, and real Rust/WASM Kernel pipeline as the CLI are used.

## Guarantees

- read-only — no file modification, no writes, no GitHub mutations
- local project tools are filesystem-local and offline; no local project context is uploaded or persisted
- `project_changes` reads already-captured local Project Brain memory only; it captures nothing, writes nothing, acquires no lock, migrates nothing, and creates no data directory
- GitHub tools reach the network only when called, and only as `GET`-only requests to `api.github.com`
- no request is made at server startup or during `tools/list`
- no telemetry, no logging of document content
- no HTTP endpoint and no HTTP/SSE MCP transport (stdio only)
- the optional `OH_MY_PM_GITHUB_TOKEN` is read only at a GitHub tool-call boundary, never printed, and never written into generated client config
- no write tools (zero MCP write tools, including for Project Brain memory)

## Generic MCP client configuration

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "node",
      "args": ["/absolute/path/to/oh-my-pm/mcp-server/bin/ohmypm-mcp.mjs"]
    }
  }
}
```

Replace the placeholder with your local repository path.

## Smoke test

After building the workspace, run the stdio smoke check:

```bash
pnpm mcp:smoke
```

It spawns the source/workspace server against an isolated standard data root, asserts the exact twelve-tool list and registration order, asserts zero write tools, calls the offline local `project_brief` on the public fixture, the offline `provider_status` tool, and the read-only `project_changes` and `project_timeline` tools over an empty store (asserting a `noPriorMemory` status, an empty timeline, that no data directory/file/lock was created, and that no forbidden sentinel leaked), asserts safe results, and prints one success line. The smoke never calls a GitHub workflow tool and never runs a network diagnostic, so it makes no network request and needs no token.
