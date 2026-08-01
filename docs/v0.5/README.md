# OH MY PM — v0.5 CLI Command Namespace

> **Status: scope locked.** v0.5 changes exactly one thing: the **name you type**.
> The canonical CLI command family becomes `ohmypm`, `ohmypm-mcp`, and
> `ohmypm-install`. The former `oh-my-pm` family keeps working as deprecated
> compatibility aliases, with **no removal scheduled**.
>
> v0.5 adds **no** feature, **no** schema change, **no** store-format change,
> **no** migration, **no** write path, and **no** network path. It is not a
> product rename.
>
> **Publication note.** The `0.5.0` source candidate merged to `main` but was
> **never published** — no `v0.5.0` tag or GitHub release exists. It is
> superseded by [`v0.5.1`](../releases/v0.5.1.md), a maintenance release that
> corrects documentation and introduces the shared application boundary while
> changing no public behavior. **`v0.5.1` is the first published stable of the
> v0.5 line and the latest published stable.**
> [`v0.5.2`](../releases/v0.5.2.md), which centralizes the GitHub-backed workflow
> in that application boundary, is prepared but **not yet published**. This guide
> describes the command migration, which both patches carry forward unchanged.

## What changed

```bash
ohmypm status
ohmypm brief .
ohmypm memory timeline --project-id example
ohmypm mcp-config
```

| Role                     | Canonical (v0.5) | Deprecated alias   |
| ------------------------ | ---------------- | ------------------ |
| CLI                      | `ohmypm`         | `oh-my-pm`         |
| MCP stdio server         | `ohmypm-mcp`     | `oh-my-pm-mcp`     |
| Release-bundle installer | `ohmypm-install` | `oh-my-pm-install` |

Starting with v0.5, `ohmypm` is the only canonical and documented CLI command.

## What deliberately did not change

This is a command namespace migration, not a product rename. Every one of these
is **unchanged**, and the repository's validation suite actively enforces that:

| Identity                       | Value                                                   |
| ------------------------------ | ------------------------------------------------------- |
| Product display name           | OH MY PM                                                |
| Repository                     | `he8um/oh-my-pm`                                        |
| Package scope                  | `@oh-my-pm/*`                                           |
| MCP server registration key    | `oh-my-pm`                                              |
| Environment variables          | `OH_MY_PM_*`                                            |
| Rust / module identifiers      | `oh_my_pm_*`                                            |
| Installation directory         | `<prefix>/lib/oh-my-pm/versions/<version>/`             |
| Release archives               | `oh-my-pm-v<version>.tar.gz`, `oh-my-pm-v<version>.zip` |
| Project config filename        | `oh-my-pm.config.json`                                  |
| Provider config directory      | `~/.config/oh-my-pm/providers.json`                     |
| Project Brain data directories | unchanged                                               |
| Error-code namespace           | unchanged                                               |

**No data migration is required.** Project Brain schema stays at 1 and the
Project Memory store format stays at 2. An existing store keeps working; nothing
is moved, copied, or rewritten because a command name changed.

## Upgrading

### If you use the commands

Replace `oh-my-pm` with `ohmypm` in your scripts and shell aliases. There is no
deadline: the old names keep working.

### If you have an installed prefix

Install v0.5 into the same prefix. A prefix installed by v0.4 has only the four
`oh-my-pm` shims; because those shims differ from what v0.5 writes, the installer
**blocks** the apply with `shim_content_mismatch` rather than overwriting them.
Rerun with `--force` once you have confirmed the existing shims are the ones OH MY
PM installed:

```bash
ohmypm-install --prefix "$HOME/.local"            # preview
ohmypm-install --prefix "$HOME/.local" --apply --force
```

Afterwards all six commands work and no orphaned shim remains:

```text
ohmypm             works
ohmypm-mcp         works
ohmypm-install     works
oh-my-pm           works, warns on stderr
oh-my-pm-mcp       works, warns on stderr
oh-my-pm-install   works, warns on stderr
```

### If you have an MCP client configuration

It keeps working. A configuration that invokes `oh-my-pm-mcp` runs through the
compatibility alias, and the server key was never a command, so nothing about the
entry is invalid.

To move it to the canonical command, regenerate it and paste the result into your
client:

```bash
ohmypm mcp-config
```

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "/absolute/path/to/prefix/bin/ohmypm-mcp",
      "args": []
    }
  }
}
```

OH MY PM never edits a client configuration file for you. `mcp-config` prints;
you paste.

## How the compatibility aliases behave

The aliases are wrappers, not a second implementation. Each one runs the exact
same code as its canonical counterpart, in the same process.

- **Arguments** are forwarded unchanged.
- **stdin, environment, working directory, exit code, and signal behavior** are
  inherited exactly, because no child process is launched.
- **The deprecation warning goes to stderr, and only to stderr.**
- **stdout stays a clean document.** `oh-my-pm status --json | jq .` still works,
  because the warning never touches stdout.
- **MCP stdout stays protocol-safe.** stdout carries JSON-RPC framing, where a
  single stray byte would desynchronize the client handshake, so `oh-my-pm-mcp`
  writes its warning to stderr before connecting the transport. MCP clients
  conventionally surface server stderr as a log, so the warning is still visible.
- **Help output teaches the canonical name.** An alias prints the same help as the
  canonical command, and that help says `ohmypm`.

```console
$ oh-my-pm status
Warning: `oh-my-pm` is a deprecated compatibility alias.   ← stderr
Use `ohmypm` instead.                                      ← stderr
OH MY PM status: healthy                                   ← stdout
version: 0.5.0
kernel: 0.5.0
```

The aliases are never presented as equal alternatives. They do not appear in help
output, README examples, generated configuration, or installation instructions —
only in compatibility code, compatibility tests, migration documentation such as
this page, and release notes.

## Deprecation policy

- Deprecated since: **0.5.0**
- Removal scheduled: **no**

There is no announced removal version. If one is ever scheduled, it will be
announced in a release ahead of time; until then the aliases are supported.

## Where the command names live

`command-surface.json` at the repository root is the single source of truth:

```json
{
  "schemaVersion": 1,
  "product": "oh-my-pm",
  "canonical": {
    "cli": "ohmypm",
    "mcp": "ohmypm-mcp",
    "installer": "ohmypm-install"
  },
  "legacyAliases": {
    "cli": ["oh-my-pm"],
    "mcp": ["oh-my-pm-mcp"],
    "installer": ["oh-my-pm-install"]
  },
  "deprecatedSince": "0.5.0",
  "removalScheduled": false
}
```

Some surfaces cannot read it at runtime — the CLI and MCP packages are
deliberately pure with no filesystem access, package manifests are static JSON,
and the release-install core must run from inside an extracted bundle with nothing
else available. Those surfaces restate the names, and two checks prove the
restatements still agree:

```bash
pnpm validate:commands     # manifests, installers, release metadata, generated config
pnpm validate:references    # no active surface presents a deprecated command
```

`validate:references` is what keeps the migration from eroding. It fails if an
active README, help file, example, installer message, or generated configuration
reintroduces `oh-my-pm` as the primary command. It is precise about this: the
product name appears legitimately throughout the repository as a package scope,
path segment, environment prefix, config filename, archive name, and server key,
so the check looks only for the shapes a _command invocation_ takes.

## Release line

- Release line: `v0.5`
- Bundle profile: `ohmypm-cli-namespace`

The profile is new rather than a reuse of v0.4's `project-brain-timeline`, which
is what lets a verifier tell a bundle that ships both command families from one
that ships only the old names. The runtime surface it describes is identical to
v0.4: twelve read-only MCP tools, zero write tools, seven memory subcommands,
schema 1, store format 2. Previously published profiles keep resolving, and an
unknown profile still fails closed.

## Non-goals

v0.5 explicitly does **not** include:

- **any Dashboard work** — no dashboard is designed, implemented, or planned here;
- a product, repository, package, or environment-variable rename;
- any new CLI command, subcommand, option, or output mode;
- any change to command behavior, JSON schemas, output contracts, storage
  formats, project-memory formats, MCP protocol behavior, or public APIs;
- any storage or data-format migration;
- any release publication, tag, or registry publication.

## See also

- [v0.5.0 release notes](../releases/v0.5.0.md)
- [Publishing v0.5.0](../releases/publishing-v0.5.0.md)
- [Getting started](../getting-started.md)
