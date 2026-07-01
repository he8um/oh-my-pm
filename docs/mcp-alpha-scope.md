# MCP Server Alpha — Scope Definition

This document resolves the open questions from `docs/mcp.md` and defines the final scope for the v0.7.0 Oh My PM MCP server alpha.

This is a public planning document. It supersedes the open-question sections of `docs/mcp.md` for v0.7.0 implementation purposes.

---

## Status

Resolved and ready for implementation. All open questions from Phase 6 are answered below.

---

## Resolved: MCP client version targeting

**Decision:** Target MCP protocol version `2024-11-05` (the stable base version supported by Claude Code and the `@modelcontextprotocol/sdk` npm package).

**Rationale:** The `@modelcontextprotocol/sdk` package targets `2024-11-05` as its stable version. Claude Code supports this version. Targeting the stable base version ensures compatibility without chasing moving specs in a v0.7.0 alpha.

**Implementation note:** Set `protocolVersion: "2024-11-05"` in the server capabilities object. Do not target a version not yet stable in the SDK.

---

## Resolved: Authentication model

**Decision:** No authentication for v0.7.0 local-only alpha.

**Rationale:** The v0.7.0 server uses stdio transport, which means it runs as a child process of the MCP client (Claude Code, Cursor, etc.) on the user's local machine. The client launches the server directly — there is no network exposure. Authentication is not needed for stdio transport.

**Implementation note:** The `mcpServers` config entry in the client's config file (`claude_desktop_config.json` or equivalent) launches the server as a subprocess. No token, no API key, no auth header is required.

**Future note:** If HTTP transport is added (v0.9.0+), authentication must be revisited. At that point, environment variable tokens (already defined in `docs/mcp-security-policy.md`) will be used.

---

## Resolved: Project root discovery

**Decision:** The MCP server reads the project root from the `OH_MY_PM_PROJECT_ROOT` environment variable. If not set, it defaults to `process.cwd()`.

**Rationale:** The server must know where to look for local files (`AGENTS.md`, `VERSION`, `ROADMAP.md`, `CHANGELOG.md`, etc.). Rather than walking the directory tree (which is fragile and potentially slow), the user or client config sets the project root explicitly.

**Implementation note:**

```ts
const projectRoot = process.env.OH_MY_PM_PROJECT_ROOT ?? process.cwd();
```

Validate that `projectRoot` is a readable directory at startup. If it is not, log to stderr and fail with a clear error — do not silently fall back to an incorrect path.

**Multi-repo behavior:** v0.7.0 supports a single project root per server instance. Multi-repo support is out of scope. If a user needs to inspect multiple projects, they run separate server instances with different `OH_MY_PM_PROJECT_ROOT` values.

---

## Resolved: Stale or unavailable data signaling

**Decision:** Tools return a `data_source` field in every response indicating where data came from and when it was read. When a file is missing or unreadable, the tool returns a structured `status: "partial"` response with a populated `warnings` array.

**Implementation note:**

Nominal response shape:

```json
{
  "status": "ok",
  "data_source": "local_repo",
  "read_at": "<iso8601 timestamp>",
  "project": { "..." }
}
```

Partial response shape (some files missing):

```json
{
  "status": "partial",
  "data_source": "local_repo",
  "read_at": "<iso8601 timestamp>",
  "warnings": [
    "CHANGELOG.md not found — change history unavailable",
    "ROADMAP.md not found — milestone data unavailable"
  ],
  "project": { "..." }
}
```

Error response shape (project root unreadable or AGENTS.md missing):

```json
{
  "status": "error",
  "error_code": "project_root_unreadable",
  "message": "Cannot read project root. Check OH_MY_PM_PROJECT_ROOT."
}
```

**Agent behavior:** The agent treats `status: "partial"` as usable data with caveats. It treats `status: "error"` as a signal to proceed without tool data and inform the user.

---

## Resolved: Graceful degradation when a connector returns an error

**Decision:** v0.7.0 has no external connectors. All tools are local-only. Graceful degradation applies to missing local files only — handled via the `status: "partial"` shape above.

**For v0.8.0+ (future):** When a connector (GitHub, ClickUp, etc.) returns an error, the tool returns `status: "error"` with `error_code: "connector_unavailable"` and a safe human-readable message. The server does not crash. The agent continues without connector data.

This is not in scope for v0.7.0 implementation but is specified here so the error shape is consistent from day one.

---

## Resolved: SDK and runtime

**Decision:**

```txt
MCP SDK:      @modelcontextprotocol/sdk (latest stable at implementation time)
Runtime:      Node.js >= 20 (LTS)
Language:     TypeScript >= 5.0
Package mgr:  pnpm
Transport:    stdio
```

**Rationale:** The `@modelcontextprotocol/sdk` npm package is the official SDK. Node.js 20 LTS is current and widely available. TypeScript 5.x is the version supported by the SDK. pnpm is already the planned package manager per `docs/mcp.md`.

---

## Resolved: Alpha tool scope (v0.7.0 only)

Four tools. No external connector required for any of them.

| Tool | Input | Returns |
| --- | --- | --- |
| `inspect_project_context` | None (uses project root) | Project name, version, description, AGENTS.md presence |
| `diagnose_project` | Optional: `focus` (string, free text hint) | RAG status, top risks, open decisions, blockers, critical path |
| `prepare_agent_handoff` | Optional: `context` (string, current session context) | Self-contained handoff prompt under 300 words |
| `summarize_delivery_status` | None | Milestone state, recent changes, open risks, next actions |

All four tools read from local files only: `AGENTS.md`, `VERSION`, `README.md`, `CHANGELOG.md`, `ROADMAP.md`.

Tools are implemented as separate files in `src/tools/`.

---

## Resolved: Alpha resource scope (v0.7.0 only)

Three resources. All read local files only.

| Resource URI | Description | Source files |
| --- | --- | --- |
| `project://current` | Project identity: name, version, status, milestone | VERSION, README.md, ROADMAP.md |
| `project://risks/open` | Open risk register items | ROADMAP.md, local risk register if present |
| `project://decisions/open` | Open decisions with owners | Local decision log if present |

Resources use the `project://` URI scheme. Resources are registered in `src/resources/registry.ts`.

---

## Resolved: Alpha prompt scope (v0.7.0 only)

Three prompts. All are pre-built delivery starting points.

| Prompt name | Description |
| --- | --- |
| `diagnose-project` | Full project diagnosis using local context |
| `prepare-agent-handoff` | Self-contained handoff prompt from local context |
| `summarize-delivery-status` | Delivery status summary from local docs |

Prompts are registered in `src/prompts/registry.ts`.

Two additional prompts (`create-delivery-plan`, `prepare-stakeholder-update`) are planned but deferred to v0.8.0 when connector data is available.

---

## Resolved: Environment variable names

```txt
OH_MY_PM_PROJECT_ROOT   — absolute path to the project root (required if not using cwd)
OH_MY_PM_LOG_LEVEL      — optional: "debug" | "info" | "warn" | "error" (default: "warn")
```

No connector credential variables in v0.7.0. Future connector variables follow the pattern defined in `docs/mcp-security-policy.md`:

```txt
OH_MY_PM_GITHUB_TOKEN   — future, v0.8.0
OH_MY_PM_CLICKUP_TOKEN  — future, v0.9.0
```

---

## Resolved: Out-of-scope connector behavior

The v0.7.0 alpha exposes no connector-dependent tools. Tools with connector-dependent behavior (`list_open_issues`, `get_milestone_status`, `list_open_blockers`, etc.) are not implemented.

If the client calls a non-existent tool, the MCP SDK returns a standard `MethodNotFound` error. The server does not need special handling for this — the SDK handles it.

---

## Out of scope for v0.7.0

| Category | Decision |
| --- | --- |
| Write actions | Not in scope. Any tool that mutates data will not be implemented. |
| External connectors | Not in scope. All tools use local files only. |
| OAuth / credential flow | Not in scope. No credentials needed for local-only alpha. |
| Dashboard | Not in scope. No UI. |
| Telemetry | Not in scope. No data collection. |
| HTTP transport | Not in scope. stdio only. |
| Multi-repo support | Not in scope. Single project root per server instance. |
| Audit logging | Not in scope. Future consideration per security policy. |
| Background polling | Not in scope. No network calls without a tool invocation. |

---

## Directory layout

```txt
packages/mcp-server/
  README.md
  package.json
  tsconfig.json
  src/
    index.ts              — entry point, starts the server
    server.ts             — server setup, tool/resource/prompt registration
    tools/
      inspect-project-context.ts
      diagnose-project.ts
      prepare-agent-handoff.ts
      summarize-delivery-status.ts
    resources/
      registry.ts
    prompts/
      registry.ts
    policy/
      read-only.ts        — enforces read-only constraint
      bilingual.ts        — output language behavior
      token-limits.ts     — response size bounds
    utils/
      safe-files.ts       — safe local file reading (no path traversal)
      formatting.ts       — structured output helpers
  tests/
    read-only-policy.test.ts
    tool-schemas.test.ts
    safe-files.test.ts
    bilingual-policy.test.ts
  examples/
    client-config.example.json    — example MCP client config
    requests.example.md           — example tool invocations
```

---

## Validation changes required

The existing `packages/mcp-server does not exist` guard in `scripts/validate-agent-files.sh` must be:

1. Removed (or inverted to `packages/mcp-server must exist`)
2. Replaced with Phase 7 checks: `packages/mcp-server` exists, `src/` exists, `tests/` exists, `package.json` exists, `README.md` exists, `src/policy/read-only.ts` exists

---

## Related docs

- `docs/mcp.md` — MCP planning (open questions now resolved by this document)
- `docs/mcp-interface-design.md` — tool names, resource URIs, I/O shapes
- `docs/mcp-security-policy.md` — security requirements
- `docs/mcp-connector-roadmap.md` — connector sequencing (v0.7.0 alpha section)
- `docs/architecture.md` — 3-layer architecture, MCP layer definition
