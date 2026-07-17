# OH MY PM

**OH MY PM** is a local project intelligence system for structured project and product delivery.

It is designed for teams that want clearer delivery context, safer execution boundaries, and repeatable validation around project work.

> **Latest stable release:** [`v0.1.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.1.0)
> **Current main development version:** `0.2.0-alpha.0` (unreleased)
>
> Local alpha. `main` may contain unreleased `0.2.0-alpha.0` work. Packages remain private; there is no npm package. `0.2.0-alpha.0` is not published.

---

## What this repository is

This repository contains the new v2 line of OH MY PM.

The previous v1 line is maintained separately as a legacy reference. This repository is a clean rebuild with a new architecture and release line.

---

## Product direction

OH MY PM focuses on one practical delivery problem:

> Given a project, what should be done next, what context matters, what boundaries apply, and how should the result be validated?

The project is local-first, validation-first, and designed to keep project execution explicit instead of relying on scattered notes, undocumented assumptions, or manual coordination.

---

## Architecture

The planned architecture is organized around these parts:

| Area | Responsibility |
| --- | --- |
| Kernel | Pure control plane for validation, state, feature flags, and update safety |
| Runtime | Request orchestration and execution flow |
| Planner | Task planning and dependency shaping |
| Context Providers | Read-only project context integrations |
| Skills | Deterministic project-management transformations |
| CLI | User-facing command surface |
| Installer | Local installation and update lifecycle |
| Validation | Structure, boundary, fixture, and release checks |
| Release Lifecycle | Controlled release state transitions |

See [`docs/architecture.md`](docs/architecture.md).

---

## First usable local workflow

After building the workspace, OH MY PM can read Markdown documents from a local project directory and generate a project status brief, a project risk report, a next-task list, or a full project handoff:

```bash
node cli/bin/oh-my-pm.mjs brief ./examples/fixtures/markdown-project --markdown
node cli/bin/oh-my-pm.mjs risks ./examples/fixtures/markdown-project --markdown
node cli/bin/oh-my-pm.mjs next ./examples/fixtures/markdown-project --markdown
node cli/bin/oh-my-pm.mjs handoff ./examples/fixtures/markdown-project --markdown
```

`brief` gives a local project overview from document-level project status. `risks` reports deterministic document-level risk signals from Markdown content: only documents containing a risk keyword are reported. `next` extracts unchecked Markdown checklist tasks. `handoff` assembles a project's objective, active work, open tasks, risks, milestones, and decisions from deterministic Markdown sections into a titled handoff with a fixed Summary / Open Tasks / Risks / Decisions layout. Every workflow is read-only and local-only: no context is uploaded, no project file is modified, and no external integration or LLM is required.

The current risk workflow reports document-level risk signals. Finer line- or item-level extraction is planned for a later phase.

The current next-task workflow extracts explicit unchecked Markdown checklist items. It does not generate tasks from arbitrary prose.

## Getting started locally

The packages are private and repository-based — there is no published release yet. See [the getting-started guide](docs/getting-started.md) for the full walkthrough. The short path is:

```bash
rustup target add wasm32-unknown-unknown
pnpm install
pnpm build
pnpm local:install -- --prefix "$HOME/.local"          # preview, writes nothing
pnpm local:install -- --prefix "$HOME/.local" --apply  # writes four shims under <prefix>/bin
pnpm local:check -- --prefix "$HOME/.local"            # read-only verification
```

Once `<prefix>/bin` is on your PATH, the installed CLI exposes the four read-only project workflows:

```bash
oh-my-pm brief ./project --markdown
oh-my-pm risks ./project --markdown
oh-my-pm next ./project --markdown
oh-my-pm handoff ./project --markdown
```

Local MCP onboarding is available too — generate a generic stdio client configuration with `pnpm mcp:config -- --prefix "$HOME/.local" --markdown`. The installer is preview-first and never edits your PATH, shell profiles, or MCP client configuration. This is a local alpha, not a public release.

### Latest stable release (v0.1.0)

The stable [`v0.1.0` release](https://github.com/he8um/oh-my-pm/releases/tag/v0.1.0) ships three assets:

```text
oh-my-pm-v0.1.0.tar.gz
oh-my-pm-v0.1.0.zip
oh-my-pm-v0.1.0-SHA256SUMS.txt
```

Stable archive users need only Node.js 20+ (no Rust or pnpm). Download, verify the checksums, extract, and run — see [the v0.1.0 release notes](docs/releases/v0.1.0.md).

### Portable release bundle (development)

A maintainer can assemble a self-contained, versioned bundle from `main` that runs on Node.js 20+ with no Rust, pnpm, or repository checkout. The bundle name is derived from the canonical version in `version.json` (currently `0.2.0-alpha.0`):

```bash
pnpm build
pnpm release:bundle -- --output .release --apply   # writes .release/oh-my-pm-v0.2.0-alpha.0/
node .release/oh-my-pm-v0.2.0-alpha.0/bin/oh-my-pm.mjs status
node .release/oh-my-pm-v0.2.0-alpha.0/bin/oh-my-pm-mcp.mjs
```

The bundle contains the compiled packages, the real Rust/WASM Kernel, the four CLI workflows, the four read-only MCP tools, deterministic `RELEASE.json` metadata, and `SHA256SUMS`. Development builds of `0.2.0-alpha.0` are not published.

### Deterministic release archives

The verified bundle can be packaged into two byte-reproducible archives plus a checksum file:

```bash
pnpm release:archives -- --bundle .release/oh-my-pm-v0.2.0-alpha.0 --output .release --apply
pnpm release:archives:check -- --assets .release
pnpm release:archives:repro -- --bundle .release/oh-my-pm-v0.2.0-alpha.0
```

Both archives expand to a single `oh-my-pm-v<version>/` directory and re-pass the bundle verifier. The `v0.1.0` GitHub Release was published through the manually gated `Release v0.1` workflow; see [the release publication guide](docs/releases/publishing-v0.1.0.md). No `v0.2` release exists yet.

## Local project configuration

Each project may define an optional `oh-my-pm.config.json` file at its root.

The configuration controls which Markdown documents are analyzed and may lower the default file and byte limits. It cannot raise safety limits, enable writes, execute code, load environment variables, or access files outside the selected project root.

```json
{
  "version": 1,
  "documents": {
    "include": [
      "README.md",
      "docs/**/*.md"
    ],
    "exclude": [
      "docs/archive/**",
      "docs/drafts/**"
    ],
    "maxFiles": 100,
    "maxBytesPerFile": 131072,
    "maxTotalBytes": 1048576
  }
}
```

Document selection follows a fixed precedence:

```text
include match → exclude check → safety limits → read-only analysis
```

- exclude rules win over include rules
- hard ignored directories (for example `.git` and `node_modules`) cannot be re-enabled
- only `<project-root>/oh-my-pm.config.json` is read; there is no upward config search
- configuration is JSON only and is optional — an absent config preserves current behavior
- an invalid config blocks the workflow with exit code `2` before any analysis
- all four workflows — `brief`, `risks`, `next`, and `handoff` — use the same resolved document set

Supported glob operators are `*` (zero or more non-slash characters), `?` (exactly one non-slash character), and `**` (across path segments, including zero). Matching is case-sensitive; the Markdown extension gate itself remains case-insensitive.

## Local MCP server

OH MY PM exposes its local Markdown project workflows over a read-only MCP stdio server.

Available tools:

- `project_brief`
- `project_risks`
- `project_next`
- `project_handoff`

After building the workspace, start the server with:

```bash
node mcp-server/bin/oh-my-pm-mcp.mjs
```

Each tool accepts a local project `root`, respects `oh-my-pm.config.json`, and uses the same Runtime, Planner, Skills, provider, and Rust/WASM Kernel pipeline as the CLI. The server does not modify files, upload project context, use telemetry, or expose an HTTP endpoint.

A generic local MCP client configuration:

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "node",
      "args": [
        "/absolute/path/to/oh-my-pm/mcp-server/bin/oh-my-pm-mcp.mjs"
      ]
    }
  }
}
```

Replace the placeholder with your local repository path.

---

## Current phase

The repository scaffold, shared contracts, Kernel foundation, Runtime foundation, CLI status/doctor/plan foundation, provider framework foundation, Planner foundation, Skills foundation, Runtime plan execution shell, package-level examples, private CLI wrapper, real WASM Kernel binding, Installer foundation, installer filesystem planning, read-only Node filesystem adapter, controlled installer execution, installer examples, CLI installer preview, release package manifest design, local package assembly dry-run, archive plan design, signed release metadata design, release integrity verification design, release channel metadata design, local update policy evaluation design, update impact preview design, rollback impact preview design, installer decision report design, installer audit event model design, installer audit trail export plan design, guarded installer write capability design, explicit write approval token design, explicit write execution plan design, write execution confirmation checklist design, controlled write adapter contract hardening, controlled write execution dry-run envelope design, installer release readiness summary design, v0 release candidate checklist design, public v0 release notes draft design, guarded release artifact planning, guarded local artifact assembly dry-run envelope design, guarded artifact creation permission model, local artifact creation execution plan design, local artifact creation adapter contract design, and local artifact creation confirmation checklist design are in place.

The first user-facing v0.1 vertical slice is now focused on local Markdown project briefs. Installer and release safety foundations remain in place, but new work is prioritizing usable project workflows over additional release abstraction.

Implementation will begin with:

1. repository scaffold
2. shared contracts package
3. Kernel and runtime foundation
4. CLI foundation
5. read-only context provider framework
6. validation and release lifecycle

See [`docs/roadmap.md`](docs/roadmap.md).

---

## Security model

The intended security posture is:

- local-first by default
- no telemetry by default
- no secrets in repository files, logs, issues, examples, or fixtures
- read-only external context integrations
- explicit user-controlled setup for any external connection

See [`docs/security-model.md`](docs/security-model.md) and [`SECURITY.md`](SECURITY.md).

---

## Contributing

This repository is early-stage. Public contributions should focus on documentation, architecture, security, and narrowly scoped implementation work once the scaffold is in place.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening an issue or pull request.

---

## License

MIT © 2026 AmirHesam Piri
