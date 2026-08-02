# Contract and repository consistency (v0.5.4)

This document is the authoritative description of the shared contracts at the
application boundary, the package dependency model, and the compatibility rules
that govern changes to either.

It is deliberately explicit about **what was newly implemented in v0.5.4 versus
what was already correct and is now mechanically enforced**, because the two are
easy to confuse and only one of them is a change in behaviour.

## What the audit found

Before writing anything, the v0.5.4 work audited the tree. The result changed the
shape of the release:

| Property                          | Audit result                                                            |
| --------------------------------- | ----------------------------------------------------------------------- |
| Production dependency cycles      | **None.** The graph was already acyclic.                                |
| Cross-package deep `src/` imports | **None anywhere** in the workspace.                                     |
| `@oh-my-pm/contracts` purity      | Already declared **zero** workspace dependencies.                       |
| CLI exit codes                    | Already consistent with the documented policy in `cli/src/help.ts`.     |
| CLI/MCP shared use cases          | Already shared for the four project workflows and the GitHub workflows. |

So v0.5.4 **repairs none of those**. It makes them mechanically enforced so they
cannot regress, and adds the contracts that genuinely did not exist.

## Newly implemented in v0.5.4

- `packages.json` — the authoritative package catalog.
- `tools/package-catalog.mjs` and `tools/validate-packages.mjs` — the catalog
  loader and the checks derived from it.
- `application/src/result.ts` — `ApplicationResult<T>`, `SourceDescriptor`,
  `Diagnostic`, `ProvenanceRecord`, and deterministic serialization.
- `application/src/taxonomy.ts` — the error taxonomy and the CLI exit-code and
  MCP error mappings.
- `application/src/diagnostics-adapter.ts` — projection from the provider
  reports into the unified `Diagnostic`.
- `tests/e2e/semantic-parity.test.ts` — direct CLI-vs-MCP assertions.

## Already correct, now mechanically enforced

- No production dependency cycle (`findCycles`, over production edges only).
- Dependencies point down the layer order, and stay inside a declared allowance.
- No package reaches inside another package's `src/`, `dist/`, or `test/`.
- No package imports a workspace package it does not declare.
- No package below `presentation` writes to `stdout`, `stderr`, or calls
  `process.exit`.
- Declared `exports` match the catalog's entry points.
- The catalog's release-bundle claims match the real dependency closure.

## The package model

### Layers

```text
contract < capability < composition < orchestration < application < presentation < packaging < development
```

A package may depend on its own layer or any layer to its **left**, never to its
right.

These names describe _this_ graph rather than importing a generic
domain/infrastructure split, which does not fit here: `providers` owns both the
network boundary and the `ProviderRegistry` abstraction that `planner` is written
against, so neither is cleanly "above" the other under the usual convention.
Ranking by actual longest dependency path gives an unambiguous order.

| Layer           | Job                                                            | Packages                        |
| --------------- | -------------------------------------------------------------- | ------------------------------- |
| `contract`      | shared shapes and owned local state; no workspace dependencies | `contracts`, `project-memory`   |
| `capability`    | one self-contained capability over the contracts               | `kernel`, `providers`, `skills` |
| `composition`   | combines capabilities without orchestrating a request          | `planner`, `installer`          |
| `orchestration` | sequences capabilities into a request/response flow            | `runtime`                       |
| `application`   | the shared use cases every surface consumes                    | `application`                   |
| `presentation`  | an adapter over the application boundary                       | `cli`, `mcp-server`             |
| `packaging`     | the release dependency surface and entrypoints                 | `distribution`                  |
| `development`   | harnesses that ship no code                                    | `examples`                      |

`project-memory` sits at `contract` because it declares no workspace dependency
at all: it owns the store format the way `contracts` owns the shared shapes.

### The intentional CLI asymmetry

`@oh-my-pm/cli` declares `runtime`, `providers`, `skills`, and `kernel` while
`@oh-my-pm/mcp-server` reaches the shared project workflows through
`@oh-my-pm/application`. **This is intentional and is not residual duplication.**

`cli/src/local-process.ts` composes a local Runtime for `status`, `doctor`, and
`plan`:

- they are runtime-identity and free-form planning commands, not project
  workflows;
- the application boundary does not expose them;
- no second presentation surface consumes them, so there is nothing to share
  with.

The four **shared** project workflows (`brief`, `risks`, `next`, `handoff`) and
the GitHub-backed workflows go through the application boundary on _both_
surfaces, and `tests/e2e/semantic-parity.test.ts` asserts the two agree
semantically.

Extending the application boundary to absorb `status`, `doctor`, and `plan`
purely for symmetry was considered and **rejected**: it would restructure three
packages to make a diagram tidier without a second consumer to justify it. If a
future surface (a Dashboard, say) ever needs runtime identity, that is the point
at which the boundary should grow — driven by a real consumer.

Separately, `@oh-my-pm/project-memory` is a **production** dependency of the CLI
so it ships in the release bundle, while being reached only through a lazy
dynamic import. `cli/test/memory-boundary.test.ts` enforces both halves. It is
not an unused dependency.

## The application result contract

```ts
interface ApplicationResult<TData> {
  schemaVersion: string;
  operation: string;
  generatedAt: string;
  source: SourceDescriptor;
  data: TData;
  diagnostics: Diagnostic[];
  provenance: ProvenanceRecord[];
}
```

`ApplicationResult<T>` is **additive**. The existing per-use-case results
(`ProjectWorkflowResult`, `GitHubWorkflowResult`) keep their exact shapes and
public behaviour; the envelope gives them a shared identity so a consumer can ask
"where did this come from?" without knowing which use case it called. Nothing is
forced into it — a low-level pure function still returns whatever it returns.

**Determinism.** `applicationResultToJson` emits canonical key order, and sorts
`selection` and `details` keys, so byte-identical inputs give byte-identical
output no matter how the object was assembled. `generatedAt` comes from the
caller's injected clock, never an ambient one, so results stay reproducible.

### Source descriptors

`SourceDescriptor` carries identity and selection metadata only:

| Field        | Meaning                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| `kind`       | one of a closed set (`local-project`, `github-issues`, `project-timeline`, …) |
| `reference`  | the caller-supplied root or `owner/repo`, **never resolved**                  |
| `identifier` | a safe item number or snapshot id                                             |
| `selection`  | bounded selection metadata; JSON-safe scalars only                            |

It must never carry a token, an authorization header, a raw transport object, a
resolved absolute path, or document content. `assertSafeSourceDescriptor`
enforces this and is the single shared rule; `unsafeValueReason` is reusable by
any surface.

**On paths specifically:** a failure message echoes the root _the caller
supplied_, verbatim. If a caller passes an absolute path, an absolute path comes
back — that is their own string, not a disclosure. The guarantee is that nothing
**resolves** the root before reporting it, so the message never reveals where the
repository actually lives.

### Provenance

`ProvenanceRecord` is **optional by design**. Attaching provenance to every
trivial field would bloat simple outputs for no benefit. Use it for findings a
reader may want to trace — an extracted risk, a classified item — with the
document path (repository-relative), line or range, GitHub item number, snapshot
id, the deriving rule, and a `truncated` flag so a bounded read is not mistaken
for a complete one.

## Diagnostics and errors

```ts
interface Diagnostic {
  code: string; // stable; consumers branch on this
  severity: "info" | "warning" | "error";
  message: string; // safe, human-readable
  remediation?: string;
  retryable?: boolean;
  source?: SourceDescriptor;
  details?: Record<string, JsonValue>; // never a cause chain or stack trace
}
```

### The error taxonomy

Eleven categories, each with a complete behavioural contract — retryability, CLI
exit code, severity, and whether MCP marks the result an error:

`validation`, `invocation`, `configuration`, `provider`, `authentication`,
`rateLimit`, `storage`, `contractCompatibility`, `unsupportedOperation`,
`securityPolicy`, `internalInvariant`.

Every existing public failure code is classified in `CODE_CATEGORIES`, and **no
code was renamed or removed** — those strings appear in CLI JSON and MCP results,
so they are public. Two tests keep the table honest in both directions: every
declared code must be classified, and every classified code must still be
declared somewhere.

An unclassified code maps to `internalInvariant` rather than throwing: a
presentation adapter must always be able to map a failure, and treating an
unknown code as our own defect is both safe and honest.

### CLI exit codes

The policy is the one already documented in `cli/src/help.ts` and already
implemented. v0.5.4 makes it explicit and testable; **it changes no exit code**.

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| `0`  | success                                                         |
| `1`  | runtime execution failed                                        |
| `2`  | invalid command or option, or a controlled precondition failure |

A caller-fixable precondition (missing root, invalid repository, invalid config)
exits `2`. A failure of our own execution (`project_runtime_failed`,
`project_output_invalid`) exits `1`.

### MCP error mapping

MCP preserves the machine-readable `code` and the sanitized `message`. An
_expected_ validation failure stays a structured result rather than an
unstructured crash, so an agent can read the code and correct its own call. A
genuine upstream or internal failure is marked an error.

### Why the provider reports were not rewritten

`ProviderStatusReport` and `ProviderDoctorReport` are returned **directly** as the
results of the `provider_status` and `github_provider_diagnostics` MCP tools, and
printed by the CLI under `--json`. Their `schemaVersion: 1` and their
`ok | info | warning | fail` vocabulary are a client-facing contract.

Rewriting them onto `Diagnostic` would change an MCP tool's output schema, which
v0.5.4 must not do. Instead `application/src/diagnostics-adapter.ts` projects them
into the unified model for consumers that want one vocabulary. The report types
are **deliberately retained public shapes**, not leftovers.

## Compatibility policy

| Change                                                                               | Classification                    | Requires                              |
| ------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------- |
| Adding an optional field to `ApplicationResult`, `Diagnostic`, or `ProvenanceRecord` | compatible additive               | patch                                 |
| Adding a new `Diagnostic` code or error category                                     | compatible additive               | patch                                 |
| Adding an MCP tool, or an optional input field                                       | compatible additive               | minor                                 |
| Correcting behaviour to match documented intent                                      | compatible behavioural correction | patch, noted in release notes         |
| Removing or retyping a field; changing an existing field's meaning                   | **breaking**                      | major, with `schemaVersion` increment |
| Renaming or removing a public failure code                                           | **breaking**                      | major                                 |
| Changing an existing CLI exit code                                                   | **breaking**                      | major                                 |
| Changing MCP tool order, or a tool's input schema incompatibly                       | **breaking**                      | major                                 |
| Changing the Project Memory store format                                             | migration required                | minor + explicit migration            |

`APPLICATION_RESULT_SCHEMA_VERSION` increments only for a breaking change to the
envelope itself. Adding an optional field does **not** increment it.

Historical readers stay supported: a Project Memory store written by an older
release must remain readable, which is why the store format is versioned
separately from the application result schema.

## Generated contracts

Generation is deterministic and verified: `pnpm build:contracts` twice must
produce byte-identical output, the committed files must match a fresh
generation, and the TypeScript and Rust forms derive from the same schema.
`pnpm validate:contracts` is the read-only check; a stale generated file fails
CI.

Generated files are never edited by hand.

## Related

- [`docs/architecture.md`](../architecture.md) — the authoritative package map.
- [`docs/v0.5/application-boundary.md`](application-boundary.md) — why the
  application layer exists.
- [`packages.json`](../../packages.json) — the machine-readable catalog.
- [`docs/releases/v0.5.4.md`](../releases/v0.5.4.md) — the release record.
