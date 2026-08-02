# Getting started

## What this version is

The source tree is at version `0.6.0`, which is also the current published stable release. The canonical commands are `omp`, `omp-mcp` and `omp-install`; the `ohmypm` family remains a supported compatibility alias and the `oh-my-pm` family a deprecated alias, both with no removal scheduled — see [the v0.6 migration guide](v0.6/README.md). [`v0.6.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.6.0) is the current published stable release; [`v0.3.0-rc.1`](https://github.com/he8um/oh-my-pm/releases/tag/v0.3.0-rc.1) is a published **prerelease** (not marked latest); `v0.5.4`, `v0.5.3`, `v0.5.2`, `v0.5.1`, `v0.4.0`, `v0.3.1`, `v0.3.0`, `v0.2.0`, `v0.2.0-rc.1` and `v0.1.0` are preserved historical releases. `v0.5.0` was never published. OH MY PM is installed from the repository or a release archive, not from a package registry — the workspace packages remain private and unpublished. Installed release archives require only **Node.js 20+**. The CLI and the MCP server are both read-only: they analyze local Markdown project documents (and, only on explicit opt-in, read-only GitHub context) and never modify project files. No project context is uploaded and no telemetry is emitted. For the v0.3 Project Brain memory feature specifically, see the [installed v0.3 getting-started guide](v0.3/getting-started-installed.md).

There are two ways to run OH MY PM:

1. **Repository development installation** — clone, build, and install command shims from the repository (below). At the current source line this builds `0.5.2`.
2. **Release archive** — download the published [`v0.5.2`](https://github.com/he8um/oh-my-pm/releases/tag/v0.5.2) stable bundle, which needs only Node.js 20+. Contributors can also [build a development bundle from `main`](#building-a-development-bundle-from-main).

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

This writes only command shims under `<prefix>/bin` — the canonical commands,
the compatibility aliases retained from v0.5, and the deprecated aliases retained
from v0.4, each with a POSIX and a Windows `.cmd` launcher:

```text
<prefix>/bin/omp
<prefix>/bin/omp.cmd
<prefix>/bin/omp-mcp
<prefix>/bin/omp-mcp.cmd
<prefix>/bin/ohmypm              # compatibility alias for omp
<prefix>/bin/ohmypm.cmd
<prefix>/bin/ohmypm-mcp          # compatibility alias for omp-mcp
<prefix>/bin/ohmypm-mcp.cmd
<prefix>/bin/oh-my-pm            # deprecated alias for omp
<prefix>/bin/oh-my-pm.cmd
<prefix>/bin/oh-my-pm-mcp        # deprecated alias for omp-mcp
<prefix>/bin/oh-my-pm-mcp.cmd
```

Use `omp` and `omp-mcp`. The `ohmypm` family still works as a supported
compatibility alias and the `oh-my-pm` family as a deprecated alias; each prints
one notice to stderr. See [the v0.6 migration guide](v0.6/README.md). No removal
is scheduled for either family.

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

The verifier is read-only. It confirms the twelve shims exist with the exact expected content — two canonical commands, two compatibility aliases, and two deprecated aliases, each as a POSIX shim plus a Windows `.cmd` shim — and, on POSIX platforms, that the POSIX shims are executable (Windows has no executable bit). It then runs the installed CLI (`status` and a fixture `brief`) and drives the installed MCP command over stdio (lists the twelve read-only tools and calls `project_brief`).

## CLI workflows

```bash
omp brief ./project --markdown
omp risks ./project --markdown
omp next ./project --markdown
omp handoff ./project --markdown
```

Each command reads an optional `oh-my-pm.config.json` at the project root to select which Markdown documents are analyzed. See [the CLI guide](../cli/README.md) for the full configuration and glob rules. These local workflows are fully offline: no network request is made and no token is read.

`risks` and `next` use deterministic, line-level, rule-based extraction over recognized English and Persian Markdown headings and markers — no LLM or fuzzy matcher. See [the deterministic extraction guide](deterministic-extraction.md).

## GitHub workflows (opt-in network)

The same four workflows can run against a GitHub repository through the explicit `github` command. This is the only part of OH MY PM that reaches the network, and only when invoked:

```bash
# Public repository — no token needed:
omp github brief owner/repository --markdown
omp github risks owner/repository --limit 25 --markdown

# Private repository or higher rate limit:
export OH_MY_PM_GITHUB_TOKEN="<fine-grained read-only token>"
omp github next owner/private-repository --markdown
```

The provider is strictly read-only (`GET`-only to `api.github.com`, REST API version `2026-03-10`). The token is optional, supplied only through `OH_MY_PM_GITHUB_TOKEN`, and never accepted as a CLI argument or printed. `--limit` accepts `1..100` (default 50). See [the GitHub provider guide](providers/github.md).

`--source` selects exactly which context to analyze (default `overview`):

```bash
omp github brief owner/repository --source repository --markdown
omp github risks owner/repository --source issues --state open --markdown
omp github handoff owner/repository --source pull-requests --state closed --markdown
omp github brief owner/repository --source item --number 123 --markdown
omp github risks owner/repository --source item --number 123 --include-comments --comment-limit 20 --markdown
omp github risks owner/repository --source item --number 123 --include-reviews --review-limit 10 --include-review-comments --review-comment-limit 10 --markdown
omp github risks owner/repository --source search --query "release blocker" --kind all --markdown
```

`item` auto-detects issue vs. pull request; `search` terms never override the injected repository/state/kind scope. The `item` source can optionally include ordinary conversation comments with `--include-comments` (disabled by default) and `--comment-limit` (`1..50`, default `20`) — see [GitHub item comments](providers/github-item-comments.md). A pull-request `item` can additionally include bounded review submissions (`--include-reviews` / `--review-limit`, `1..20`, default `10`) and inline review comments (`--include-review-comments` / `--review-comment-limit`), disabled by default and only when the item is a pull request — see [GitHub pull-request reviews](providers/github-pr-reviews.md). Provider configuration may set `defaultSource`/`defaultState`. See [GitHub source selection](providers/github-source-selection.md).

## Provider configuration and diagnostics

Provider configuration is optional and strictly read-only. Create the file yourself (OH MY PM never writes it) to set GitHub defaults so you can omit the repository and limit:

```json
{
  "version": 1,
  "providers": {
    "github": {
      "enabled": true,
      "defaultRepository": "he8um/oh-my-pm",
      "defaultLimit": 50
    }
  }
}
```

Place it at `~/.config/oh-my-pm/providers.json` (POSIX) or `%APPDATA%\oh-my-pm\providers.json` (Windows), or point at it explicitly:

```bash
omp providers status \
  --provider-config ./providers.json \
  --markdown

# With a configured default repository:
omp github risks --markdown
```

Inspect and validate resolved provider state without touching the network:

```bash
omp providers status --markdown
omp providers doctor --markdown
```

To verify GitHub connectivity, opt in explicitly — this performs exactly one read-only repository-metadata request:

```bash
omp providers doctor github \
  --confirm-network \
  --markdown
```

No secret is ever allowed in the file; the token stays in `OH_MY_PM_GITHUB_TOKEN`. Local commands never read provider configuration. See [provider configuration](providers/configuration.md) and [provider diagnostics](providers/diagnostics.md).

## MCP onboarding

The installed CLI prints a configuration for its own installation, with no prefix
argument required:

```bash
omp mcp-config              # JSON (default)
omp mcp-config --markdown   # the same JSON in a documented Markdown block
omp mcp-config --name my-project   # a custom server key
```

From a repository checkout — which has no installed prefix to infer — the
repository helper takes an explicit prefix instead:

```bash
pnpm mcp:config -- --prefix "$HOME/.local" --markdown
```

Both print the same generic stdio entry (absolute command path, empty `args`) and
write nothing. Then:

- copy the generated stdio server entry into your MCP client's configuration manually
- reload or restart the client as that client requires
- do not place a project path in the server configuration
- pass the project `root` when invoking a local tool
- exactly twelve read-only tools are available, and zero write tools: `project_brief`, `project_risks`, `project_next`, `project_handoff`, `github_project_brief`, `github_project_risks`, `github_project_next`, `github_project_handoff`, `provider_status`, `github_provider_diagnostics`, `project_changes`, `project_timeline`
- the four local tools stay filesystem-local; the four GitHub tools perform read-only outbound API requests only when called; `provider_status` is offline and `github_provider_diagnostics` reaches the network only with `confirmNetwork: true`
- supply `OH_MY_PM_GITHUB_TOKEN` and (optionally) `OH_MY_PM_PROVIDER_CONFIG` to the MCP server process environment only if you need them — the generator never inserts secrets or a config path

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

## Installing a published stable release

The latest published stable release is
[`v0.4.0`](https://github.com/he8um/oh-my-pm/releases/tag/v0.4.0). The steps
below use `v0.2.0` as a worked example of the archive layout, which is identical
across releases — substitute the version you downloaded.

### Historical worked example (v0.2.0)

The latest stable release is published at:

```text
https://github.com/he8um/oh-my-pm/releases/tag/v0.2.0
```

Stable archive users need only **Node.js 20+** (no Rust or pnpm). Download the three assets, verify the checksums, extract, then use the preview-first installer:

```bash
sha256sum -c oh-my-pm-v0.2.0-SHA256SUMS.txt   # checksum verification is required

tar -xzf oh-my-pm-v0.2.0.tar.gz               # or: unzip oh-my-pm-v0.2.0.zip

# Preview writes nothing and requires an explicit --prefix.
node ./oh-my-pm-v0.2.0/bin/ohmypm-install.mjs --prefix "$HOME/.local"
# Apply installs a versioned, source-independent copy under the prefix.
node ./oh-my-pm-v0.2.0/bin/ohmypm-install.mjs --prefix "$HOME/.local" --apply

export PATH="$HOME/.local/bin:$PATH"           # add it yourself; the installer never edits PATH
omp status                                # reports the installed version and kernel
```

Each archive expands to a single `oh-my-pm-v0.2.0/` directory. See [the v0.2.0 release notes](releases/v0.2.0.md), [the post-stable closure report](releases/v0.2.0-post-stable-closure.md), and [the v0.2.x maintenance policy](releases/v0.2.x-maintenance-policy.md). The [full self-installer walkthrough](#self-installing-a-development-bundle) covers preview/apply/force semantics and the installed layout. The earlier [`v0.1.0` release](releases/v0.1.0.md) remains available as a preserved historical stable.

## Building a development bundle from main

Contributors can assemble a self-contained, versioned bundle whose name is derived from [`version.json`](../version.json). The examples below show `0.2.0` paths; substitute the version in `version.json` for your checkout:

```bash
pnpm build
pnpm release:bundle -- --output .release --apply
```

This produces `.release/oh-my-pm-v0.2.0/`, which is movable anywhere and runs standalone on Node.js 20+:

```bash
node ./oh-my-pm-v0.2.0/bin/ohmypm.mjs status
node ./oh-my-pm-v0.2.0/bin/ohmypm.mjs brief ./project --markdown
node ./oh-my-pm-v0.2.0/bin/ohmypm-mcp.mjs
```

Every portable bundle contains a complete, prebuilt Node-loadable Rust/WASM Kernel binding (the JS glue, the WASM binary, and a CommonJS manifest). End users need only Node.js 20+ — no Rust toolchain and no `wasm-bindgen`. Bundle assembly validates and stages that binding identically on Ubuntu, macOS, and Windows; installation copies the already verified bundle and never rebuilds the Kernel. The generated binding is build output and is never committed to the repository.

The bundle can also be packaged into deterministic archives, verified for reproducibility:

```bash
pnpm release:archives -- --bundle .release/oh-my-pm-v0.2.0 --output .release --apply
pnpm release:archives:check -- --assets .release
```

Locally assembled bundles produce the same artifact shape as a published release. Each stable publication is performed through a manually gated release workflow after a separate approval — see, for the v0.2 line, [the stable publishing guide](releases/publishing-v0.2.0.md) and [the post-stable closure report](releases/v0.2.0-post-stable-closure.md).

> **Temporary-workspace safety.** Development and verification commands must clean only a uniquely created OH MY PM workspace. Never delete the parent of an installation prefix or the shared system temporary directory. When scripting an end-to-end check, create one owned root (for example `mktemp -d "${TMPDIR:-/tmp}/oh-my-pm-e2e.XXXXXX"`), place every generated path beneath it, and remove only that exact root. Deleting the inferred parent of a generated prefix is unsafe: when the prefix sits directly under the system temp directory, its parent is the shared temp root.

## Self-installing a development bundle

There are three distinct ways to run OH MY PM, in increasing independence from a repository checkout:

1. **Published stable archive** — download, verify checksums, extract, and run the shipped preview-first installer (see [Installing a published stable release](#installing-a-published-stable-release)). The earliest v0.1.0 archive has no installer; run its `node ./oh-my-pm-v0.1.0/bin/*.mjs` entrypoints directly.
2. **Repository-development install** — from a checkout, `pnpm local:install -- --prefix <prefix> --apply` writes twelve shims that point back into the repository (see [Apply local installation](#apply-local-installation)).
3. **Bundle self-installation** — extract a portable bundle and run its own installer, which copies a complete, versioned, source-independent installation into an explicit prefix.

The third path uses the installer shipped inside every bundle:

```bash
sha256sum -c oh-my-pm-v0.2.0-SHA256SUMS.txt   # verify checksums first
tar -xzf oh-my-pm-v0.2.0.tar.gz               # or: unzip oh-my-pm-v0.2.0.zip

# Preview writes nothing and requires an explicit --prefix.
node ./oh-my-pm-v0.2.0/bin/ohmypm-install.mjs --prefix "$HOME/.local"

# Apply installs the versioned copy and the twelve command shims.
node ./oh-my-pm-v0.2.0/bin/ohmypm-install.mjs --prefix "$HOME/.local" --apply

export PATH="$HOME/.local/bin:$PATH"                # add it yourself; the installer never edits PATH

omp status
omp brief ./project --markdown
# GitHub opt-in (read-only; network only when invoked; token optional, env-only):
omp github brief owner/repository --markdown
# Installed stdio MCP server, absolute command:
"$HOME/.local/bin/ohmypm-mcp"
```

### Installed layout

Apply produces a self-contained tree under the prefix:

```text
<prefix>/
├── bin/
│   ├── ohmypm             # POSIX shim → ../lib/oh-my-pm/versions/<version>/bin/ohmypm.mjs
│   ├── ohmypm.cmd         # Windows shim → ..\lib\oh-my-pm\versions\<version>\bin\ohmypm.mjs
│   ├── ohmypm-mcp
│   ├── ohmypm-mcp.cmd
│   ├── oh-my-pm           # deprecated alias for ohmypm (warns on stderr)
│   ├── oh-my-pm.cmd
│   ├── oh-my-pm-mcp       # deprecated alias for ohmypm-mcp
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
- **`--force`** (only with `--apply`) replaces the exact managed targets — the version directory, the twelve shims, and `install.json` — and nothing else. Unrelated files under `<prefix>/bin` and `<prefix>/lib`, and other version directories, are left untouched. `--force` is the explicit replacement gate; it is **not** a version-policy engine and performs no update, downgrade, rollback, or uninstall.
- A second apply from the same bundle is a no-op that reports **already installed**.
- Any managed target that exists but does not exactly match the expected installation **blocks** without `--force`.

Apply is transactional: it copies, verifies bundle content and checksums, stages the shims and manifest, then atomically renames each managed target into place, and rolls back every change if any step fails. A post-install verification then re-derives the installed state and re-runs the installed bundle's own verifier before reporting success. This verification is platform-aware: the installer sets POSIX executable-mode bits on Linux and macOS but not on Windows (which uses `.cmd` shims), so exact shim **content** is required on every platform while the executable **bit** is required only where the platform models it. Bundle-content and checksum verification are identical on all platforms.

The installer never downloads anything, never edits your PATH, shell profiles, or MCP client configuration, and never writes to project files.

### Verifying an installation

From a repository checkout:

```bash
pnpm release:install:check -- --prefix "$HOME/.local"
```

The read-only verifier validates the manifest, the versioned bundle, the twelve shims, then runs the installed CLI (`status` plus the four workflows) and the installed MCP server over stdio. Outside a checkout, verify directly with the installed commands:

```bash
omp status
omp brief ./project --markdown
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

There is no uninstall command yet. Remove exactly these files — the canonical
commands and the deprecated compatibility aliases:

```text
<prefix>/bin/ohmypm
<prefix>/bin/ohmypm.cmd
<prefix>/bin/ohmypm-mcp
<prefix>/bin/ohmypm-mcp.cmd
<prefix>/bin/oh-my-pm
<prefix>/bin/oh-my-pm.cmd
<prefix>/bin/oh-my-pm-mcp
<prefix>/bin/oh-my-pm-mcp.cmd
```

An installation made by v0.4 has only the four `oh-my-pm` shims; remove those.
Then remove the product directory:

```text
<prefix>/lib/oh-my-pm/
```

Do not delete unrelated contents of `<prefix>`.
