# @oh-my-pm/application

The shared application boundary for OH MY PM. Private workspace package, never
published to npm.

CLI, MCP, and any future presentation surface consume the same typed use cases
from here. No presentation surface reimplements project loading, provider
diagnostics, runtime composition, or Project Memory orchestration.

## Why this package exists

Before v0.5.1, `@oh-my-pm/cli` owned the shared application logic, and
`@oh-my-pm/mcp-server` depended on the CLI package to reuse it:

```text
MCP ──> CLI ──> Runtime / Providers / Project Memory
```

A second presentation surface should not depend on a first one, and a third —
the planned v0.6 local Dashboard — must not be forced to carry argument parsing,
help text, and process-exit machinery it can never use.

```text
CLI ───────────┐
MCP ───────────┼──> Application ──> Runtime / Providers / Project Memory
Future UI ─────┘                    └──> Planner / Skills / Kernel
```

The future UI line is architectural context only. **v0.5.1 implements no
Dashboard**, no HTTP server, and no UI package.

## What this package owns

- local project workflows over configured Markdown documents
- GitHub-backed project workflows, including fail-closed resolution ordering
- provider status and doctor diagnostics
- Project Memory orchestration: capture, status, history, changes, timeline,
  export, delete
- deterministic Runtime request construction
- the explicit Node adapters behind `@oh-my-pm/application/node`

Every use case returns a **typed structured result**. Failures are data, not
thrown errors.

## What this package must never own

Enforced by [`test/boundary.test.ts`](./test/boundary.test.ts) and
[`tools/validate-boundaries.mjs`](../tools/validate-boundaries.mjs):

| Forbidden | Why |
| --- | --- |
| `process.argv` parsing | argument grammar is a CLI concern |
| CLI help text | presentation |
| stdout / stderr writes | the caller owns its process streams |
| `process.exit` | the caller owns its exit code |
| executable names | the package does not know how it is invoked |
| MCP JSON-RPC, tool responses | protocol is an MCP concern |
| terminal rendering, HTML | presentation |
| HTTP servers, ports, sockets | no network surface beyond the GitHub provider |
| importing CLI, MCP, Installer, or Distribution | inverted dependency |

## Export surfaces

| Surface | Contents |
| --- | --- |
| `@oh-my-pm/application` | use-case contracts, dependency-injected orchestration, structured errors, shared result types. Node-free. |
| `@oh-my-pm/application/node` | read-only filesystem adapters, project config and document loading, provider config resolution, the GitHub token boundary, and composed Node dependencies. |

The root surface imports no `node:` builtin. Node filesystem objects never leak
into domain-level results: adapters return plain data, and a result may echo a
caller-supplied reference but never a resolved absolute path.

### The one documented exception

`memory-process.ts` reads `process.pid` to derive the store's internal staging
operation id. The value is never printed and never persisted in a Project Brain
payload, and every caller may inject `processId` instead. The boundary test
pins this exception so it cannot silently widen.

## Use-case inventory

### Local project workflows

```ts
getLocalProjectBrief(root, deps)
getLocalProjectRisks(root, deps)
getLocalProjectNextActions(root, deps)
getLocalProjectHandoff(root, deps)
```

Deterministic and offline: a fixed clock, no randomness, no environment read, no
network, no write. The project root never enters the Runtime payload.

### GitHub project workflows

```ts
getGitHubProjectBrief(input, deps)
getGitHubProjectRisks(input, deps)
getGitHubProjectNextActions(input, deps)
getGitHubProjectHandoff(input, deps)
```

Resolution order is a safety property, not an implementation detail:
configuration, repository, and selection all resolve **before** a token is read
or a transport is constructed, so every controlled failure stays offline.

### Provider diagnostics

```ts
getProviderStatus(deps)
runProviderDoctor({ confirmNetwork, provider, repository }, deps)
```

Offline by default. The single optional read-only network request happens only
for `github` with explicit confirmation. A token is read only to report its
**presence** — the value never enters a report, a message, or a result.

### Project Memory

```ts
previewProjectCapture(request, deps)    applyProjectCapture(request, deps)
previewProjectExport(request, deps)     applyProjectExport(request, deps)
previewProjectDelete(request, deps)     applyProjectDelete(request, deps)

getProjectMemoryStatus(request, deps)   getProjectMemoryHistory(request, deps)
getProjectChanges(request, deps)        getProjectTimeline(request, deps)
```

Preview and apply are separate use cases by design. **A preview performs zero
writes**: it creates no data directory, acquires no lock, and writes no staging,
manifest, record, or lock file. A preview is never implemented by writing and
rolling back.

## Dependency injection

Use cases take their side-effecting dependencies as parameters, so the core
surface stays Node-free and tests stay offline:

```ts
import { getLocalProjectBrief } from "@oh-my-pm/application";
import { createNodeLocalProjectDeps } from "@oh-my-pm/application/node";

const result = await getLocalProjectBrief(root, createNodeLocalProjectDeps({ version }));
if (!result.ok) {
  // result.code and result.message are already sanitized
}
```

## How the adapters consume it

**CLI** parses arguments, calls a use case, and maps the typed result to a
terminal rendering (brief, JSON, or Markdown) and an exit code. It owns the
process boundary; it never invokes itself as a subprocess and never parses an
MCP response.

**MCP** registers tools, validates input schemas, calls the same use case, and
maps the typed result through its strict public projection. It owns JSON-RPC,
annotations, and protocol stdout safety. It has **no dependency on
`@oh-my-pm/cli`**.

**A future Dashboard** would import the same use cases and render them. It would
add its own presentation package and depend on this one — never on the CLI. That
is the entire point of this boundary, and it is why no Dashboard code lives here
in v0.5.1.

## Testing

```bash
pnpm --filter @oh-my-pm/application test
```

Covers orchestration, dependency injection, sanitized errors, absence of raw
path and secret leakage, deterministic repeated results, and the static
architecture boundary.

## See also

- [Application boundary](../docs/v0.5/application-boundary.md)
- [v0.5.1 scope](../docs/v0.5/v0.5.1-scope.md)
- [Architecture](../docs/architecture.md)
