# Getting started — Project Timeline (v0.4)

A hands-on walkthrough of the one new v0.4 capability, from an **installed**
OH MY PM artifact. It assumes you already have a Project Brain store with at
least two captures — see the
[installed getting-started guide](../v0.3/getting-started-installed.md) if not.

Everything here is **read-only**. No command in this guide writes a project file,
writes application state, creates a directory, or touches the network.

## What a timeline is

A timeline is **derived**, not stored. Each query:

1. reads the store's authoritative capture chronology;
2. compares adjacent committed snapshots through the existing deterministic
   change engine;
3. projects the results into bounded, sanitized events.

There is no timeline file to manage, no timeline to migrate, and nothing to keep
in sync. Deleting nothing and capturing nothing changes the answer: the same
store and the same inputs always produce byte-identical output.

## 1. A first timeline

```sh
oh-my-pm memory timeline --project-id my-project
```

```text
OH MY PM memory timeline: 5
project: my-project
limit: 20
more: no
- #3.0 removed task PLAN.md#task-2 — Write the docs
- #3.1 added task PLAN.md#task-3 — Qualify the release
- #3.2 removed risk PLAN.md#risk-3 — Scope creep is a risk (severity medium)
- #2.0 removed task PLAN.md#task-1 — Ship the timeline
- #2.1 added task PLAN.md#task-2 — Write the docs
```

`#3.0` reads as capture sequence 3, event sequence 0. The newest capture comes
first; within a capture, events ascend in the change engine's deterministic
order.

`--project-id` is required. Unlike the other memory commands, `timeline` needs
**no project root** and reads no project config — it identifies the project by id
alone, so you can run it from anywhere.

## 2. Structured output

```sh
oh-my-pm memory timeline --project-id my-project --json
oh-my-pm memory timeline --project-id my-project --markdown
```

JSON matches the public contract exactly. Each event carries only:

`eventId`, `projectId`, `snapshotId`, `captureSequence`, `eventSequence`,
`capturedAt`, `category`, `kind`, `subjectId`, `evidenceCount`, and the optional
`title`, `status`, `severity`, `dueDate`.

Evidence is a **count**, never an id. Raw values, file paths, application-data
paths, and provider results never appear.

Markdown groups events by capture under fixed headings and invents no summary —
every line restates recorded fields:

```markdown
### Capture #3 — 2026-07-30T22:40:02.627Z

- Snapshot: `snapshot:34b36ef…`
- removed task `PLAN.md#task-2` — Write the docs (evidence: 1)
```

## 3. Filtering

Both filters use the **existing** change taxonomy — there is no new vocabulary
to learn.

```sh
# By change category
oh-my-pm memory timeline --project-id my-project --category added

# By item kind
oh-my-pm memory timeline --project-id my-project --kind risk

# Both, as a conjunction
oh-my-pm memory timeline --project-id my-project --category added --kind risk
```

Valid `--category` values:

```text
added  removed  modified  resolved  reopened  becameOverdue
noLongerOverdue  severityIncreased  severityDecreased  fresh  stale
evidenceChanged
```

Valid `--kind` values:

```text
milestone  task  risk  decision  dependency  blocker
```

Anything else exits `2` and lists the accepted values. Filtering is applied
**before** the limit, so a filtered page is never short because filtered-out
events consumed its budget.

## 4. Paging through a long history

```sh
# First page
oh-my-pm memory timeline --project-id my-project --limit 10 --json
```

When `hasMore` is `true`, the result carries `nextBeforeSequence`. Pass it back:

```sh
oh-my-pm memory timeline --project-id my-project --limit 10 \
  --before-sequence <nextBeforeSequence> --json
```

Repeat until `hasMore` is `false`. Walking the pages this way visits every event
exactly once — no duplicate and no skip.

Pagination works by **capture boundary**, so a page never splits a capture. If a
single capture holds more events than the limit, that capture is returned whole
and the count is reported truthfully rather than trimmed mid-capture.

`--limit` accepts `1`..`100` and defaults to `20`.

## 5. From an MCP client

The installed configuration is printed for you:

```sh
oh-my-pm mcp-config --markdown
```

It documents **twelve** read-only tools and zero write tools. The new one is
`project_timeline`:

```json
{
  "name": "project_timeline",
  "arguments": { "projectId": "my-project", "limit": 10, "kind": "risk" }
}
```

It accepts no filesystem path — it resolves the standard application-data
location itself. The result is a bounded, sanitized projection:
`schemaVersion: 1`, `chronology: "capture-order"`, `eventCount`, `hasMore`, an
optional `nextBeforeSequence`, and the events. It performs no writes.

## 6. Empty and error cases

| Situation | Behavior |
|---|---|
| unknown project | exit `0`, a valid empty timeline |
| zero or one capture | exit `0`, a valid empty timeline (no adjacent pair) |
| identical adjacent captures | exit `0`, no events |
| filter matching nothing | exit `0`, no events |
| missing `--project-id` | exit `2` |
| `--limit` outside 1..100 | exit `2` |
| unknown `--category` / `--kind` | exit `2`, with the accepted values listed |
| `--apply` | exit `2` — the timeline is read-only and has no apply mode |
| a corrupt store | nonzero exit, a controlled error, **no partial output** |
| a store needing migration | nonzero exit; migration stays explicit and never runs from a read |

## 7. Upgrading from v0.3.1

Nothing to do. Project Brain schema stays `1` and store format stays `2`, so a
store created by the public `v0.3.1` build is read directly with **no migration
and no repair** — including by the new timeline command. The six existing memory
subcommands and eleven existing MCP tools are unchanged.
