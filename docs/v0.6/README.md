# v0.6 — canonical `omp` command family

v0.6 makes **`omp`** the canonical command. Nothing else about OH MY PM changes:
this is a command namespace migration, not a product rename and not a data
migration.

If you do nothing, everything you already have keeps working. No configuration
file needs editing, no stored data needs converting, and no command is removed.

## The three command families

| Family      | Status              | Behavior                                 |
| ----------- | ------------------- | ---------------------------------------- |
| `omp*`      | **canonical**       | No notice. Use this in new work.         |
| `ohmypm*`   | compatibility alias | Works. One notice on **stderr**.         |
| `oh-my-pm*` | deprecated alias    | Works. One deprecation notice on stderr. |

Per role:

| Role      | Canonical     | Compatibility    | Deprecated         |
| --------- | ------------- | ---------------- | ------------------ |
| CLI       | `omp`         | `ohmypm`         | `oh-my-pm`         |
| MCP       | `omp-mcp`     | `ohmypm-mcp`     | `oh-my-pm-mcp`     |
| Installer | `omp-install` | `ohmypm-install` | `oh-my-pm-install` |

`ohmypm*` is deliberately a **compatibility alias, not a deprecated one**. It was
the canonical family in v0.5 — one minor version ago — so treating it as
deprecated would retroactively withdraw a promise. It is fully supported.

**No removal is scheduled for either alias family.** Neither `ohmypm*` nor
`oh-my-pm*` will be removed in any v0.6.x release.

## What changed

- `omp`, `omp-mcp`, and `omp-install` are the canonical executables.
- `ohmypm*` became a supported compatibility alias family.
- Active documentation and generated MCP client configuration use `omp*`.
- An install now writes shims for all three families.

## What did NOT change

Everything below is byte-for-byte identical to v0.5. If a document, script, or
tool tells you otherwise, the document is wrong.

| Identity               | Value (unchanged)                  |
| ---------------------- | ---------------------------------- |
| Product name           | OH MY PM                           |
| Package scope          | `@oh-my-pm/*`                      |
| Environment prefix     | `OH_MY_PM_*`                       |
| Project data directory | `.oh-my-pm/`                       |
| User data directory    | `~/.oh-my-pm/`                     |
| Install layout         | `lib/oh-my-pm/versions/<version>/` |
| Release archive prefix | `oh-my-pm-v<version>`              |
| MCP server key         | `oh-my-pm`                         |
| Repository             | `he8um/oh-my-pm`                   |

Also unchanged:

- **Project Memory** — schema 1 and store format 2. **No data migration.**
- **MCP** — the same twelve read-only tools, in the same order, with the same
  schemas and annotations. stdio transport only.
- **CLI** — every command, JSON schema, Markdown report structure, and exit code.
- **Provider behavior** and the read-only policy.
- **No Dashboard**, no HTTP server, no write capability.

## Before and after

Local workflows:

```bash
# before (v0.5)
ohmypm brief ./project --json

# after (v0.6) — identical output
omp brief ./project --json
```

GitHub workflows:

```bash
# before
ohmypm github risks owner/repository --markdown

# after
omp github risks owner/repository --markdown
```

Project Memory:

```bash
# before
ohmypm memory timeline --project-id example

# after
omp memory timeline --project-id example
```

MCP client configuration:

```bash
# before
ohmypm mcp-config

# after
omp mcp-config
```

Installing a release bundle:

```bash
# before
./bin/ohmypm-install --prefix "$HOME/.local" --apply

# after
./bin/omp-install --prefix "$HOME/.local" --apply
```

## The generated MCP configuration

`omp mcp-config` now emits `omp-mcp` as the `command`. The **server key stays
`oh-my-pm`**:

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "/home/you/.local/bin/omp-mcp",
      "args": []
    }
  }
}
```

An existing configuration that names `ohmypm-mcp` or `oh-my-pm-mcp` **keeps
working** — those executables are still installed. Regenerating is optional; OH
MY PM never rewrites a configuration file you own.

Because the server key did not change, regenerating does not create a duplicate
server entry in your client.

## Alias notices

An alias writes exactly one line to **stderr**, then behaves identically:

```console
$ ohmypm status
Warning: `ohmypm` is a compatibility alias; use `omp`.
OH MY PM status: healthy
...
```

```console
$ oh-my-pm status
Warning: `oh-my-pm` is deprecated; use `omp`.
OH MY PM status: healthy
...
```

Two guarantees make this safe to script against:

- **stdout is byte-identical** to the canonical command's. A piped `--json`
  invocation stays parseable through any alias.
- **The MCP stdio stream is never touched.** The notice is written to stderr
  before the transport connects, so it cannot desynchronize JSON-RPC.

To silence a notice, use the canonical command or redirect stderr
(`2>/dev/null`) — though redirecting also hides real diagnostics.

## Upgrading

There is nothing you must do. When you want to adopt the canonical names:

1. Install v0.6 as usual. All three families are installed.
2. Replace `ohmypm`/`oh-my-pm` with `omp` in your own scripts and aliases.
3. Optionally run `omp mcp-config` and paste the result into your MCP client.

You can migrate incrementally — the families coexist on one installed prefix.

## Known limitations

These are unchanged from v0.5 and remain future work:

- `ApplicationResult<T>` is not yet adopted by every workflow return type.
- Provider diagnostics keep their own report shape.
- Advanced side-effect analysis is not implemented.
- No Dashboard.
