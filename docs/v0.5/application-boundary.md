# The Application Boundary

> Introduced in **v0.5.1**. `@oh-my-pm/application` is the shared application
> layer that CLI, MCP, and any future presentation surface consume.
>
> **v0.5.1 implements no Dashboard.** This package is the foundation for v0.6,
> not the v0.6 Dashboard itself.

## Why this package exists

Before v0.5.1, `@oh-my-pm/cli` owned far more than a command-line adapter:

- local project document loading and project configuration,
- runtime request construction and Runtime composition,
- provider diagnostics orchestration,
- Project Memory process orchestration,
- Node-specific filesystem boundaries.

Because that logic lived in the CLI package, `@oh-my-pm/mcp-server` had to
depend on the CLI to reuse it:

```text
MCP ──> CLI ──> Runtime / Providers / Project Memory
```

That direction is wrong in a way that only gets more expensive. A second
presentation surface should never depend on a first one, and a third — the
planned v0.6 local Dashboard — must not be forced to carry argument parsing,
help text, exit-code mapping, and process-exit machinery it can never use.

It was also a correctness risk. When two surfaces re-implement the same
workflow, they drift: the same project root can produce a different error
message, a different classification, or a different result depending on whether
it was reached through `ohmypm` or an MCP tool call.

## The target

```text
CLI ───────────┐
MCP ───────────┼──> Application ──> Runtime / Providers / Project Memory
Future UI ─────┘                    └──> Planner / Skills / Kernel
```

The **Future UI** line is architectural context only. No UI package, HTTP
server, port, or browser entry point exists in v0.5.1, and
`tools/validate-boundaries.mjs` fails the build if one appears.

## What the package owns

| Area | Use cases |
| --- | --- |
| Local project workflows | `getLocalProjectBrief`, `getLocalProjectRisks`, `getLocalProjectNextActions`, `getLocalProjectHandoff` |
| GitHub workflows | `getGitHubProjectBrief`, `getGitHubProjectRisks`, `getGitHubProjectNextActions`, `getGitHubProjectHandoff` |
| Provider diagnostics | `getProviderStatus`, `runProviderDoctor` |
| Project Memory | `previewProjectCapture`, `applyProjectCapture`, `getProjectMemoryStatus`, `getProjectMemoryHistory`, `getProjectChanges`, `getProjectTimeline`, `previewProjectExport`, `applyProjectExport`, `previewProjectDelete`, `applyProjectDelete` |
| Shared projection | `formatRuntimeResponse` — the JSON, Markdown, and brief renderings of a `RuntimeResponse` |
| Command vocabulary | the canonical and deprecated executable names, and the deprecation warning |
| Node adapters | read-only document, project-config, and provider-config loading; the GitHub token boundary |

Every use case returns a **typed structured result**. Failures are data, not
thrown errors, and every message is sanitized before it leaves the package.

### Preview and apply are separate use cases

Mirroring the store's contract: a preview performs **zero writes**. It creates
no data directory, acquires no lock, and writes no staging, manifest, record, or
lock file. A preview is never implemented by writing and rolling back.

### Fail-closed ordering is a safety property

In the GitHub workflows, configuration, repository, and source selection all
resolve **before** a token is read or a transport is constructed. Every
controlled failure therefore happens offline. That ordering is asserted by the
package's tests, not left to convention.

## What the package must never own

Enforced by `tools/validate-boundaries.mjs` (section 10) and
`application/test/boundary.test.ts`:

| Forbidden | Why |
| --- | --- |
| parsing `process.argv` | argument grammar is a CLI concern |
| producing CLI help | presentation |
| writing to stdout or stderr | the caller owns its process streams |
| calling `process.exit` | the caller owns its exit code |
| knowing executable names outside `command-surface.ts` | a use case must not know how it was invoked |
| knowing MCP JSON-RPC or building tool responses | protocol is an MCP concern |
| rendering terminal text or HTML | presentation |
| HTTP servers, ports, sockets | no network surface beyond the GitHub provider |
| importing CLI, MCP, Installer, or Distribution | the inverted dependency this package exists to remove |

Each of these guards was verified by injecting the violation and confirming the
validator fails.

## Core versus Node

| Surface | Contents |
| --- | --- |
| `@oh-my-pm/application` | use-case contracts, dependency-injected orchestration, structured errors, shared result types. Imports no `node:` builtin. |
| `@oh-my-pm/application/node` | read-only filesystem adapters, project and provider configuration loading, the GitHub token boundary, and composed Node dependencies. |

The split is what keeps the core testable without a filesystem and reusable by a
surface that resolves its inputs differently. Node filesystem objects never leak
into domain-level results: adapters return plain data, and a result may echo a
caller-supplied reference but never a resolved absolute path.

### The one documented exception

`memory-process.ts` reads `process.pid` to derive the store's internal staging
operation id. The value is never printed and never persisted in a Project Brain
payload, and every caller may inject `processId` instead. The boundary test pins
this exception so it cannot silently widen.

## How the CLI consumes it

The CLI parses arguments, calls a use case, and maps the typed result to a
terminal rendering and an exit code:

```ts
import { getProviderStatus } from "@oh-my-pm/application";
import { createNodeProviderDiagnosticsDeps } from "@oh-my-pm/application/node";

const { ok, report } = getProviderStatus(createNodeProviderDiagnosticsDeps({ version }));
return {
  exitCode: ok ? 0 : 2,
  stdout: formatProviderStatusReport(report, outputMode),
  stderr: "",
};
```

The CLI owns the process boundary. It never invokes itself as a subprocess and
never parses an MCP response.

## How the MCP server consumes it

The MCP server registers tools, validates input schemas, calls the same use
case, and maps the typed result through its **strict public projection** — the
projection is genuinely MCP-specific and stays in the MCP package, because it
decides what a tool may expose (identity and provenance, never a body, token,
header, raw provider response, planner input, task graph, or Runtime trace).

The MCP server owns JSON-RPC, annotations, error conversion, and protocol stdout
safety. As of v0.5.1 it has **no dependency on `@oh-my-pm/cli`**.

## How a future Dashboard would consume it

Exactly the same way, and that is the point:

```text
dashboard/  ──depends on──>  @oh-my-pm/application
            ──depends on──>  @oh-my-pm/application/node   (if it needs local files)
```

It would add its own presentation package containing its own rendering, its own
transport, and its own process boundary — and depend on this package for the use
cases. It would **not** depend on the CLI, and it would not need any change to
the application layer to exist.

## Why v0.5.1 implements no Dashboard

v0.5.1 is a patch release. Its whole purpose is to make the dependency direction
correct *before* a third surface exists, so that adding one is an additive
change rather than another restructuring. Shipping a Dashboard in the same
release would mix an internal refactor with a large new user-facing feature and
make both harder to review and to revert.

The Dashboard is recorded as **planned for v0.6**. Nothing about it is designed,
implemented, or enabled here.

## Verification

```bash
pnpm --filter @oh-my-pm/application test   # use cases, DI, sanitized errors, boundary
pnpm validate:boundaries                   # architecture guards
pnpm validate:docs                         # documentation truth
```

## See also

- [`application/README.md`](../../application/README.md) — package reference
- [v0.5.1 scope](./v0.5.1-scope.md) — the release scope and architecture decision
- [Architecture](../architecture.md) — the implemented system
