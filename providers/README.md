# @oh-my-pm/providers

Read-only context provider framework for OH MY PM.

The local provider is an in-memory provider over caller-supplied items. For the CLI `brief` command, the explicit Node CLI boundary in the CLI package reads Markdown project documents from the user-selected root and passes the resulting items into the local provider. The local provider performs no filesystem access: it never imports Node filesystem modules and only normalizes and serves the items it is given.

Provider execution is asynchronous: `Provider.execute` and `ProviderRegistry.execute` return `Promise<ProviderResult>`. The local provider resolves synchronously in spirit (its work is pure) but conforms to the async contract so real network-backed providers fit the same shape.

## GitHub read-only provider

`createGitHubProvider({ transport })` is a strictly read-only GitHub provider for repository metadata, issues, and pull requests. It performs only `GET` requests against a single fixed origin (`api.github.com`, REST API version `2026-03-10`) through an injected `GitHubHttpTransport`. The production transport (`createNodeGitHubHttpTransport`) is built on Node's global `fetch`, enforces a request timeout and a response-byte ceiling, follows only bounded same-origin redirects, and filters response headers. The provider package never reads environment variables; the optional token is injected by the process adapter. The `github/transport.ts` module is the single network boundary — every other GitHub module is pure. See [docs/providers/github.md](../docs/providers/github.md).
