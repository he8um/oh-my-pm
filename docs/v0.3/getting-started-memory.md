# Getting Started — Project Memory (v0.3 Phase 4)

> **This is an unreleased v0.3 development feature. It is not available in the
> published v0.2 artifacts.** The `memory` commands run from the
> source/workspace CLI only; installed-artifact qualification is deferred to
> Phase 6. `version.json` remains `0.2.0`.

The `memory` commands let OH MY PM remember a local project over time: capture a
minimized, privacy-preserving snapshot of what it observed, compare it with the
previous snapshot, and inspect, export, or delete that local memory. Nothing is
written inside the analyzed project, nothing is uploaded, and every mutation is
preview-first.

## Prerequisites

- The workspace built from source (`pnpm build`).
- A project directory containing Markdown, with an `oh-my-pm.config.json` that
  declares an explicit, stable `projectId`.
- A data directory outside the project for the local memory (pass `--data-dir`,
  or rely on the OS application-data location).

The CLI never creates or edits `oh-my-pm.config.json`.

## 1. Declare an explicit project id

In the project root, create `oh-my-pm.config.json`:

```json
{
  "version": 1,
  "projectId": "my-project",
  "documents": { "include": ["**/*.md"] }
}
```

`projectId` is optional for the legacy commands (`brief`, `risks`, `next`,
`handoff`, …) and required only for `memory`. You may instead pass
`--project-id my-project` on each `memory` command, which overrides the config.

Add some Markdown signals — English and Persian both work:

```
docs/status.md
--------------
# Project
## Next steps
- Wire the API
## Risks
- Timeline is tight

docs/status-fa.md
-----------------
# وضعیت
## ریسک ها
- بودجه محدود است
```

## 2. Preview a capture (writes nothing)

```
oh-my-pm memory capture . --data-dir ./.oh-my-pm-data
```

The preview runs the full pipeline and reports whether a capture would create a
snapshot, without writing a single byte. No data directory is created.

```
OH MY PM memory capture: preview
would write: no
would create snapshot: yes
project: my-project
snapshot: snapshot:…
items: 2
evidence: 2
coverage: complete
```

## 3. Apply the capture

```
oh-my-pm memory capture . --data-dir ./.oh-my-pm-data --apply
```

This commits exactly one snapshot to the local data directory. The analyzed
project is untouched.

## 4. Change the project and capture again

Edit `docs/status.md` (add a `## Blockers` section, a new next step, …), then:

```
oh-my-pm memory capture . --data-dir ./.oh-my-pm-data --apply
```

## 5. Inspect status and history

```
oh-my-pm memory status  . --data-dir ./.oh-my-pm-data
oh-my-pm memory history . --data-dir ./.oh-my-pm-data --limit 20
```

`status` reports `healthy` (or `noPriorMemory`, `corrupt`, …) with snapshot and
evidence counts. `history` lists snapshots **newest capture first** — real
capture order (each record carries its `capturedAt` and a 1-based `sequence`),
not a content-derived ID order — marking the latest and reporting the store's
`chronologyOrigin` (`native`, or `recoveredV1` for a migrated store). See
[phase-4-1-snapshot-chronology.md](phase-4-1-snapshot-chronology.md).

### Migrating an older store

A store written before the chronology correction (internal store format 1) must
be migrated to format 2 before a capture. Migration is explicit and never runs on
a read:

```
# Preview only — reports that a v1 store would migrate; writes nothing:
oh-my-pm memory capture . --data-dir ./.oh-my-pm-data --migrate-store

# Migrate once, then capture once:
oh-my-pm memory capture . --data-dir ./.oh-my-pm-data --apply --migrate-store
```

`memory capture --apply` against a v1 store without `--migrate-store` exits `4`
(migration required) and writes nothing. `--migrate-store` is valid only for
`capture`.

## 6. Compare the latest two snapshots

```
oh-my-pm memory changes . --data-dir ./.oh-my-pm-data --json
```

`changes` returns a deterministic `ChangeSet`. Add `--previous <id> --current
<id>` to compare an explicit pair (the two ids must differ). With no prior memory
or a single snapshot it reports `noPriorMemory` / `insufficientHistory` (exit 3),
not an error.

## 7. Export and delete (preview-first)

```
# Preview — writes nothing:
oh-my-pm memory export . --data-dir ./.oh-my-pm-data --destination ./memory-export

# Apply — copies the committed records to the destination directory:
oh-my-pm memory export . --data-dir ./.oh-my-pm-data --destination ./memory-export --apply

# Preview a delete — writes nothing:
oh-my-pm memory delete . --data-dir ./.oh-my-pm-data

# Apply a delete — requires an exact confirmation:
oh-my-pm memory delete . --data-dir ./.oh-my-pm-data --apply --confirm my-project
```

After the confirmed delete, `memory status` reports `noPriorMemory`.

## Output modes and exit codes

Every command accepts `--json` and `--markdown`; the default is a concise brief
text. Exit codes are stable: `0` success (including previews and a delete no-op),
`2` invalid input/option/config/identity/confirmation, `3` no prior memory or
insufficient history, `4` a locked/corrupt/incompatible store, `1` an operational
failure.

## What is and is not stored

Stored (outside the project, in the data directory): minimized evidence
fingerprints, derived titles, opaque ids, allow-listed metadata, timestamps, and
coverage. Never stored: raw document bodies, tokens or credentials, absolute
project or data-root paths.
