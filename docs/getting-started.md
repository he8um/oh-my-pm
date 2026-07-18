# Getting started

## What this version is

This is a local alpha of OH MY PM. It is installed from the repository, not from a package registry — the workspace packages remain private and unpublished. The CLI and the MCP server are both read-only: they analyze local Markdown project documents and never modify project files. No external integration is required, and no project context is uploaded and no telemetry is emitted.

There are two ways to run OH MY PM:

1. **Repository development installation** — clone, build, and install command shims from the repository (below).
2. **Stable release archive** — download the published [`v0.1.0`](#installing-the-stable-v010-release) bundle that needs only Node.js 20+. Contributors can also [build a development bundle from `main`](#building-a-development-bundle-from-main).

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

Each command reads an optional `oh-my-pm.config.json` at the project root to select which Markdown documents are analyzed. See [the CLI guide](../cli/README.md) for the full configuration and glob rules. These local workflows are fully offline: no network request is made and no token is read.

## GitHub workflows (opt-in network)

The same four workflows can run against a GitHub repository through the explicit `github` command. This is the only part of OH MY PM that reaches the network, and only when invoked:

```bash
# Public repository — no token needed:
oh-my-pm github brief owner/repository --markdown
oh-my-pm github risks owner/repository --limit 25 --markdown

# Private repository or higher rate limit:
export OH_MY_PM_GITHUB_TOKEN="<fine-grained read-only token>"
oh-my-pm github next owner/private-repository --markdown
```

The provider is strictly read-only (`GET`-only to `api.github.com`, REST API version `2026-03-10`). The token is optional, supplied only through `OH_MY_PM_GITHUB_TOKEN`, and never accepted as a CLI argument or printed. `--limit` accepts `1..100` (default 50). See [the GitHub provider guide](providers/github.md).

## MCP onboarding

Generate a generic stdio MCP client configuration:

```bash
pnpm mcp:config -- --prefix "$HOME/.local" --markdown
```

Then:

- copy the generated stdio server entry into your MCP client's configuration manually
- reload or restart the client as that client requires
- do not place a project path in the server configuration
- pass the project `root` when invoking a local tool
- exactly eight tools are available: `project_brief`, `project_risks`, `project_next`, `project_handoff`, `github_project_brief`, `github_project_risks`, `github_project_next`, `github_project_handoff`
- the four local tools stay filesystem-local; the four GitHub tools perform read-only outbound API requests only when called
- supply `OH_MY_PM_GITHUB_TOKEN` to the MCP server process environment only if you need it — the generator never inserts secrets

The generator prints configuration only; it never writes to a client application and never inserts a token.

## Example MCP calls

A local tool takes a project root:

```json
{ "root": "./project" }
```

A GitHub tool takes a repository and an optional limit:

```json
{ "repository": "owner/repository", "limit": 50 }
```

## Installing the stable v0.1.0 release

The stable release is published at:

```text
https://github.com/he8um/oh-my-pm/releases/tag/v0.1.0
```

Stable archive users need only **Node.js 20+** (no Rust or pnpm). Download the three assets, verify the checksums, extract, and run:

```bash
sha256sum -c oh-my-pm-v0.1.0-SHA256SUMS.txt   # checksum verification is required

tar -xzf oh-my-pm-v0.1.0.tar.gz               # or: unzip oh-my-pm-v0.1.0.zip
node ./oh-my-pm-v0.1.0/bin/oh-my-pm.mjs status
node ./oh-my-pm-v0.1.0/bin/oh-my-pm.mjs brief ./project --markdown
node ./oh-my-pm-v0.1.0/bin/oh-my-pm-mcp.mjs
```

Each archive expands to a single `oh-my-pm-v0.1.0/` directory. See [the v0.1.0 release notes](releases/v0.1.0.md).

## Building a development bundle from main

`main` may contain unreleased `0.2.0-alpha.0` work. Contributors can assemble a self-contained, versioned bundle whose name is derived from `version.json`:

```bash
pnpm build
pnpm release:bundle -- --output .release --apply
```

This produces `.release/oh-my-pm-v0.2.0-alpha.0/`, which is movable anywhere and runs standalone on Node.js 20+:

```bash
node ./oh-my-pm-v0.2.0-alpha.0/bin/oh-my-pm.mjs status
node ./oh-my-pm-v0.2.0-alpha.0/bin/oh-my-pm.mjs brief ./project --markdown
node ./oh-my-pm-v0.2.0-alpha.0/bin/oh-my-pm-mcp.mjs
```

The bundle can also be packaged into deterministic archives, verified for reproducibility:

```bash
pnpm release:archives -- --bundle .release/oh-my-pm-v0.2.0-alpha.0 --output .release --apply
pnpm release:archives:check -- --assets .release
```

Development builds of `0.2.0-alpha.0` are not published; only the stable `v0.1.0` release has public downloads.

## Self-installing a v0.2 development bundle

There are three distinct ways to run OH MY PM, in increasing independence from a repository checkout:

1. **Stable v0.1.0 manual archive** — download, verify checksums, extract, and run `node ./oh-my-pm-v0.1.0/bin/*.mjs` directly (see above). v0.1 has no installer; its immutable archive predates this feature.
2. **Repository-development install** — from a checkout, `pnpm local:install -- --prefix <prefix> --apply` writes four shims that point back into the repository (see [Apply local installation](#apply-local-installation)).
3. **v0.2 development bundle self-installation** — extract a portable `0.2.0-alpha.0` bundle and run its own installer, which copies a complete, versioned, source-independent installation into an explicit prefix.

The third path uses the installer shipped inside every current bundle:

```bash
tar -xzf oh-my-pm-v0.2.0-alpha.0.tar.gz          # or: unzip oh-my-pm-v0.2.0-alpha.0.zip

# Preview writes nothing and requires an explicit --prefix.
node ./oh-my-pm-v0.2.0-alpha.0/bin/oh-my-pm-install.mjs --prefix "$HOME/.local"

# Apply installs the versioned copy and the four command shims.
node ./oh-my-pm-v0.2.0-alpha.0/bin/oh-my-pm-install.mjs --prefix "$HOME/.local" --apply

export PATH="$HOME/.local/bin:$PATH"                # add it yourself; the installer never edits PATH

oh-my-pm status
oh-my-pm brief ./project --markdown
oh-my-pm-mcp
```

### Installed layout

Apply produces a self-contained tree under the prefix:

```text
<prefix>/
├── bin/
│   ├── oh-my-pm            # POSIX shim → ../lib/oh-my-pm/versions/<version>/bin/oh-my-pm.mjs
│   ├── oh-my-pm.cmd        # Windows shim → ..\lib\oh-my-pm\versions\<version>\bin\oh-my-pm.mjs
│   ├── oh-my-pm-mcp
│   └── oh-my-pm-mcp.cmd
└── lib/
    └── oh-my-pm/
        ├── install.json    # deterministic manifest (no timestamps, no absolute paths)
        └── versions/
            └── <version>/  # the complete verified bundle
```

The shims use paths relative to `<prefix>/bin`, so the whole prefix is movable as one tree. After a successful apply the installation no longer depends on the extracted bundle — you may delete the archive and extraction directory and the installed commands keep working.

### Preview, apply, and force semantics

- **Preview is the default** and performs no writes. It reports `create`, `already-installed`, `replace`, or `blocked`.
- **`--apply`** is required for any write.
- **`--force`** (only with `--apply`) replaces the exact managed targets — the version directory, the four shims, and `install.json` — and nothing else. Unrelated files under `<prefix>/bin` and `<prefix>/lib`, and other version directories, are left untouched. `--force` is the explicit replacement gate; it is **not** a version-policy engine and performs no update, downgrade, rollback, or uninstall.
- A second apply from the same bundle is a no-op that reports **already installed**.
- Any managed target that exists but does not exactly match the expected installation **blocks** without `--force`.

The installer never downloads anything, never edits your PATH, shell profiles, or MCP client configuration, and never writes to project files.

### Verifying an installation

From a repository checkout:

```bash
pnpm release:install:check -- --prefix "$HOME/.local"
```

The read-only verifier validates the manifest, the versioned bundle, the four shims, then runs the installed CLI (`status` plus the four workflows) and the installed MCP server over stdio. Outside a checkout, verify directly with the installed commands:

```bash
oh-my-pm status
oh-my-pm brief ./project --markdown
```

Maintainers with a checkout can also install any explicitly supplied verified bundle through the repository wrapper:

```bash
pnpm release:install -- --bundle <path-to-bundle> --prefix "$HOME/.local" --apply
```

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
