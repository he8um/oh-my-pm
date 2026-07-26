# Getting started — installed v0.3.0

This guide walks through the **installed** stable v0.3.0 artifact end to end:
download and verify, install (preview then apply), configure a project, capture
and inspect memory, configure an MCP client, migrate a v1 store, and understand
data locations and uninstall limitations.

> This is the stable **v0.3.0** Project Brain release. It was promoted from the
> validated `v0.3.0-rc.1` prerelease with no product behavior change. The
> preserved RC guide
> ([getting-started-installed-rc.md](getting-started-installed-rc.md)) documents
> the prerelease.

## 1. Download and verify the checksum

Download the three assets for your platform from the `v0.3.0` release:

```
oh-my-pm-v0.3.0.tar.gz      # Linux, macOS
oh-my-pm-v0.3.0.zip         # Windows (also usable on Linux/macOS)
oh-my-pm-v0.3.0-SHA256SUMS.txt
```

Verify before extracting:

```sh
# Linux / macOS
sha256sum -c oh-my-pm-v0.3.0-SHA256SUMS.txt      # Linux
shasum -a 256 -c oh-my-pm-v0.3.0-SHA256SUMS.txt  # macOS
```

```powershell
# Windows (PowerShell)
Get-Content oh-my-pm-v0.3.0-SHA256SUMS.txt | ForEach-Object {
  $parts = $_ -split "\s+", 2
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $parts[1].Trim()).Hash.ToLower()
  if ($actual -ne $parts[0]) { throw "checksum mismatch for $($parts[1])" }
}
```

Then extract the archive (`tar -xzf …` or `unzip …`). It contains a single
`oh-my-pm-v0.3.0/` directory.

## 2. Preview the installation (writes nothing)

The installer is preview-first and requires an explicit prefix. A preview creates
no files:

```sh
node oh-my-pm-v0.3.0/bin/oh-my-pm-install.mjs --prefix "$HOME/.local/oh-my-pm"
```

It prints the shims and version directory it *would* create.

## 3. Apply the installation

```sh
node oh-my-pm-v0.3.0/bin/oh-my-pm-install.mjs --prefix "$HOME/.local/oh-my-pm" --apply
```

This installs command shims under `<prefix>/bin` (`oh-my-pm`, `oh-my-pm.cmd`,
`oh-my-pm-mcp`, `oh-my-pm-mcp.cmd`) and the versioned artifact under
`<prefix>/lib/oh-my-pm/versions/0.3.0`. The installer never edits your PATH
or shell profile; add `<prefix>/bin` to PATH yourself if desired. The whole
prefix is relocatable — you can move it as one tree.

Verify the installed state (read-only):

```sh
node oh-my-pm-v0.3.0/bin/oh-my-pm-install.mjs --help  # (installer usage)
"$HOME/.local/oh-my-pm/bin/oh-my-pm" status
```

## 4. Configure a project with an explicit project id

Project identity is always explicit. Either pass `--project-id <id>` on each
command, or add a read-only `oh-my-pm.config.json` at your project root:

```json
{ "projectId": "my-project" }
```

The id is opaque (1–256 bytes, no control characters, not `.`/`..`, no slash).
OH MY PM never derives an id from your path, username, or hostname, and never
writes the id back into your config.

## 5. Capture memory (preview, then apply)

Capture is preview-first. A preview writes nothing:

```sh
oh-my-pm memory capture . --project-id my-project
```

It reports the state and snapshot fingerprints, item/evidence counts, and that it
`wouldWrite: false`. Apply to commit one snapshot:

```sh
oh-my-pm memory capture . --project-id my-project --apply
```

Edit your project's Markdown, then capture again to record a second snapshot:

```sh
oh-my-pm memory capture . --project-id my-project --apply
```

Add `--json` or `--markdown` to any command for structured output.

## 6. Inspect: status, history, changes

```sh
oh-my-pm memory status  . --project-id my-project           # healthy, snapshot count, format 2 / schema 1
oh-my-pm memory history . --project-id my-project            # newest capture first (capture-order chronology)
oh-my-pm memory changes . --project-id my-project            # latest vs its immediate predecessor
oh-my-pm memory changes . --project-id my-project \
  --previous <snapshotId> --current <snapshotId>             # an explicit pair
```

`changes` is read-only and rejects `--apply`.

## 7. Configure an MCP client

The MCP server speaks stdio only. Point your MCP client at the installed shim:

```json
{
  "mcpServers": {
    "oh-my-pm": {
      "command": "/absolute/path/to/prefix/bin/oh-my-pm-mcp"
    }
  }
}
```

On Windows use the `.cmd` shim or invoke Node against the installed
`oh-my-pm-mcp.mjs` entrypoint directly.

### `project_changes` example

The v0.3 MCP surface exposes eleven read-only tools; the new one is
`project_changes`. It accepts no filesystem path — it resolves the standard
application-data location itself:

```json
{ "name": "project_changes", "arguments": { "projectId": "my-project" } }
```

It returns a bounded, sanitized projection: `schemaVersion: 1`, a `status`
(`compared` / `noPriorMemory` / `insufficientHistory`), `chronology:
"capture-order"`, a summary, and a list of projected changes carrying only
allow-listed scalars plus an `evidenceCount` (never evidence ids, raw values, or
paths). It performs no writes.

## 8. Export and delete

```sh
# Export (preview writes nothing; apply copies committed memory to a directory)
oh-my-pm memory export . --project-id my-project --destination ./memory-export
oh-my-pm memory export . --project-id my-project --destination ./memory-export --apply

# Delete (preview writes nothing; apply requires the exact project id)
oh-my-pm memory delete . --project-id my-project
oh-my-pm memory delete . --project-id my-project --apply --confirm my-project
```

## 9. Migrate a v1 store to v2

If you carry a store written by an earlier v1 layout, read commands report
`migrationRequired` and write nothing. Migration is explicit and preview-first:

```sh
# Preview the migration (writes nothing)
oh-my-pm memory capture . --project-id my-project --migrate-store

# Perform the migration and capture in one explicit step (retains a backup)
oh-my-pm memory capture . --project-id my-project --apply --migrate-store
```

Migration never runs from a read and never runs automatically. A backup of the v1
store is retained. After migration the store is format 2 with recovered
capture-order chronology.

## 10. Data location by OS

Memory is stored under the platform-standard application-data directory (subpath
`oh-my-pm`), never inside your project:

```
Linux:            $XDG_DATA_HOME/oh-my-pm   (fallback: $HOME/.local/share/oh-my-pm)
macOS:            $HOME/Library/Application Support/oh-my-pm
Windows:          %LOCALAPPDATA%\oh-my-pm
```

The CLI also accepts an explicit `--data-dir <path>`. The MCP `project_changes`
tool always uses the standard location (it accepts no data path). No resolved
application-data path appears in CLI or MCP output.

## 11. Uninstall limitations

There is no dedicated uninstall command in this release. To remove the
installation, delete the install prefix you chose (its `bin/` shims and
`lib/oh-my-pm/versions/…`). To remove captured memory, use
`oh-my-pm memory delete … --apply --confirm <project-id>` per project, or remove
the `oh-my-pm` directory under your platform's application-data location. The
installer never wrote to your PATH or shell profile, so there is nothing to undo
there.

## Status

This is the stable **v0.3.0** Project Brain release, promoted from the validated
`v0.3.0-rc.1` prerelease with no product behavior change. Please report issues
against the `v0.3.0` tag.
