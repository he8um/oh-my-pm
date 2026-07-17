# Getting started

## What this version is

This is a local alpha of OH MY PM. It is installed from the repository, not from a package registry — the workspace packages remain private and unpublished. The CLI and the MCP server are both read-only: they analyze local Markdown project documents and never modify project files. No external integration is required, and no project context is uploaded and no telemetry is emitted.

There are two ways to run OH MY PM:

1. **Repository development installation** — clone, build, and install command shims from the repository (below).
2. **Portable bundle usage** — run a self-contained `oh-my-pm-v0.1.0/` bundle that needs only Node.js 20+ (see [Portable bundle usage](#portable-bundle-usage)).

## Requirements

- Git
- Node.js 20+
- Corepack / pnpm 9.15.0
- Rust toolchain
- the `wasm32-unknown-unknown` target

## Clone and build

```bash
git clone <repository>
cd oh-my-pm
corepack enable
corepack prepare pnpm@9.15.0 --activate
rustup target add wasm32-unknown-unknown
pnpm install
pnpm build
```

## Preview local installation

Installation is preview-first. A preview writes nothing:

```bash
pnpm local:install -- --prefix "$HOME/.local"
```

It reports what would be created under `<prefix>/bin` and exits without touching the filesystem.

## Apply local installation

```bash
pnpm local:install -- --prefix "$HOME/.local" --apply
```

This writes only four command shims under `<prefix>/bin`:

```text
<prefix>/bin/oh-my-pm
<prefix>/bin/oh-my-pm.cmd
<prefix>/bin/oh-my-pm-mcp
<prefix>/bin/oh-my-pm-mcp.cmd
```

Nothing else is written. If a shim already exists, the apply is blocked; rerun with `--apply --force` only after you have inspected the existing shim.

## PATH

Add `<prefix>/bin` to your PATH yourself — the installer never edits shell profiles.

For the current shell session on POSIX:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

For the current PowerShell session on Windows (session-only, not permanent):

```powershell
$env:Path = "$HOME\.local\bin;$env:Path"
```

Make the change permanent through your own shell configuration if you want it to persist.

## Verify

```bash
pnpm local:check -- --prefix "$HOME/.local"
```

The verifier is read-only. It confirms the four shims exist and are executable, runs the installed CLI (`status` and a fixture `brief`), and drives the installed MCP command over stdio (lists the four tools and calls `project_brief`).

## CLI workflows

```bash
oh-my-pm brief ./project --markdown
oh-my-pm risks ./project --markdown
oh-my-pm next ./project --markdown
oh-my-pm handoff ./project --markdown
```

Each command reads an optional `oh-my-pm.config.json` at the project root to select which Markdown documents are analyzed. See [the CLI guide](../cli/README.md) for the full configuration and glob rules.

## MCP onboarding

Generate a generic stdio MCP client configuration:

```bash
pnpm mcp:config -- --prefix "$HOME/.local" --markdown
```

Then:

- copy the generated stdio server entry into your MCP client's configuration manually
- reload or restart the client as that client requires
- do not place a project path in the server configuration
- pass the project `root` when invoking a tool
- exactly four tools are available: `project_brief`, `project_risks`, `project_next`, `project_handoff`

The generator prints configuration only; it never writes to a client application.

## Example MCP calls

Each tool takes a single input naming a local project root:

```json
{ "root": "./project" }
```

## Portable bundle usage

A maintainer can assemble a self-contained, versioned bundle from a repository checkout:

```bash
pnpm build
pnpm release:bundle -- --output .release --apply
```

This produces `.release/oh-my-pm-v0.1.0/`, which is movable anywhere and runs standalone:

```bash
node ./oh-my-pm-v0.1.0/bin/oh-my-pm.mjs status
node ./oh-my-pm-v0.1.0/bin/oh-my-pm.mjs brief ./project --markdown
node ./oh-my-pm-v0.1.0/bin/oh-my-pm-mcp.mjs
```

Bundle consumers need **Node.js 20+** and do **not** need Rust or pnpm. This commit prepares release-candidate packaging only; there is no official public download until a later release step. See [the v0.1.0 release notes](releases/v0.1.0.md) for the bundle contents and verification.

## Troubleshooting

- **Build target missing** — run `rustup target add wasm32-unknown-unknown`, then `pnpm build`.
- **Command not found** — ensure `<prefix>/bin` is on your PATH for the current shell.
- **Shim blocked** — a shim already exists; inspect it, then rerun with `--apply --force` if replacing it is intended.
- **Invalid project config** — the command exits with code `2` and names the config path and code; fix `oh-my-pm.config.json`.
- **No Markdown documents matched** — the command exits with code `2`; adjust the config include/exclude rules or the root.
- **MCP client shows no output** — the stdio server reserves stdout for MCP protocol messages only; check the client's own logs.

## Uninstall

There is no uninstall command yet. Remove exactly these files:

```text
<prefix>/bin/oh-my-pm
<prefix>/bin/oh-my-pm.cmd
<prefix>/bin/oh-my-pm-mcp
<prefix>/bin/oh-my-pm-mcp.cmd
```

Do not delete unrelated contents of `<prefix>`.
