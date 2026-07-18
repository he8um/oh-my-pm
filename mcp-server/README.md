# @oh-my-pm/mcp-server

Private Model Context Protocol (MCP) server for OH MY PM. It exposes eight
read-only tools to MCP clients over stdio: four local Markdown project workflows
(filesystem-only) and four GitHub workflows (read-only outbound API requests,
only when called). It is private and is not published.

## Build requirement

Build the workspace first so the compiled server and the real WASM Kernel binding exist:

```bash
pnpm build
```

## Transport

The only transport is local **stdio**. There is no HTTP, SSE, host, port, network listener, authentication, or session. `stdout` is reserved for MCP protocol messages; a fatal startup error writes one concise line to `stderr` and exits non-zero. Project roots are loaded only when a tool is called — the server does no scanning at startup.

Start the server (development, from the repository):

```bash
node mcp-server/bin/oh-my-pm-mcp.mjs
```

After a local installation (see [the getting-started guide](../docs/getting-started.md)), the server is available through the installed command once `<prefix>/bin` is on PATH:

```bash
oh-my-pm-mcp
```

Generate a generic stdio client configuration for the installed command:

```bash
pnpm mcp:config -- --prefix "$HOME/.local" --markdown
```

The generator prints the configuration only — it never writes to or edits a client application. Copy the entry into your MCP client's configuration manually.

## Tools

Exactly eight tools are registered, in this order — four local, then four GitHub:

- `project_brief` — deterministic project status brief
- `project_risks` — document-level risk signals
- `project_next` — unchecked Markdown checklist tasks
- `project_handoff` — deterministic project handoff
- `github_project_brief` — GitHub repository status brief
- `github_project_risks` — GitHub repository risk signals
- `github_project_next` — GitHub repository next tasks
- `github_project_handoff` — GitHub repository handoff

The four local tools accept a project root:

```json
{ "root": "./path/to/project" }
```

`root` defaults to `.`. Each local tool is filesystem-local, read-only, and Markdown-based, respects `oh-my-pm.config.json`, and never modifies files.

The four GitHub tools accept a repository and an optional limit:

```json
{ "repository": "owner/repository", "limit": 50 }
```

`repository` must be a bare `owner/repository`; `limit` is `1..100` (default 50). There is no token, API-URL, arbitrary-query, or local-root input. Each GitHub tool is read-only. Server startup and `tools/list` make **no** GitHub request — a request happens only when a GitHub tool is called, over `GET`-only HTTPS to `api.github.com`. Supply the optional `OH_MY_PM_GITHUB_TOKEN` to the server process environment when needed; it is never accepted as a tool input and never included in output. See [the GitHub provider guide](../docs/providers/github.md).

### Success behavior

- `content` contains the human-readable Markdown, identical to the CLI's `--markdown` output for the same workflow.
- `structuredContent` contains a compact, public-safe projection: `operation`, `root` (the caller-provided value, never an absolute path), a small `documents` metadata object, and the strict `result` shape for the operation.

The result never contains raw document bodies, raw provider responses, the internal runtime response, execution traces, absolute paths, filesystem handles, secrets, or adapter objects.

### Errors

Tool-level failures are returned as MCP tool errors (`isError: true`) with a concise `<code>: <message>` text and no stack trace or absolute path. Failure codes: `project_config_invalid`, `project_root_not_found`, `project_root_not_directory`, `project_documents_empty`, `project_runtime_failed`, `project_output_invalid`.

## Configuration and document selection

Each tool reuses the CLI's configured document loader: it reads only `<root>/oh-my-pm.config.json` when present (no upward search), applies the same include/exclude glob rules and file/byte limits, and loads the selected Markdown documents read-only. The same Runtime, Planner, Skills, provider registry, and real Rust/WASM Kernel pipeline as the CLI are used.

## Guarantees

- read-only — no file modification, no writes, no GitHub mutations
- local project tools are filesystem-local and offline; no local project context is uploaded or persisted
- GitHub tools reach the network only when called, and only as `GET`-only requests to `api.github.com`
- no request is made at server startup or during `tools/list`
- no telemetry, no logging of document content
- no HTTP endpoint and no HTTP/SSE MCP transport (stdio only)
- the optional `OH_MY_PM_GITHUB_TOKEN` is read only at a GitHub tool-call boundary, never printed, and never written into generated client config
- no write tools

## Generic MCP client configuration

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "node",
      "args": ["/absolute/path/to/oh-my-pm/mcp-server/bin/oh-my-pm-mcp.mjs"]
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

It spawns the server, asserts the exact eight-tool list, calls only the offline local `project_brief` on the public fixture, asserts a safe result, and prints one success line. The smoke never calls a GitHub tool, so it makes no network request and needs no token.
