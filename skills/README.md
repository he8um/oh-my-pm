# @oh-my-pm/skills

Deterministic project-management transformations for OH MY PM.

Every skill is deterministic and read-only: the same input envelope always produces the same output envelope, and no skill touches the filesystem, the network, the clock, or randomness.

Built-in skills:

- **summarize status** (`summarizeStatus`) — counts open/blocked/done items and surfaces highlights for a project status brief.
- **extract risks** (`extractRisks`) — detects risk signals in supplied items.
- **derive next tasks** (`deriveNextTasks`) — proposes the next actionable tasks from supplied items.
- **create handoff** (`createHandoff`) — assembles a structured project handoff from deterministic Markdown section extraction.
- **review changes** (`reviewChanges`) — summarizes supplied change items.

The Runtime plan path supplies generic provider items to skills as `items` only. Explicit `tasks`, `risks`, and `changes` collections are reserved for direct package consumers that call a skill with pre-declared collections.

## extractRisks

Risk detection is deterministic keyword matching over the normalized combined item text (title, body, status, and tags):

- generic Runtime items are keyword-filtered: an item without a risk keyword produces no risk entry
- items are not automatically treated as explicit risks; only a directly supplied `risks` collection is explicit
- items are document-level: at most one risk entry per supplied item
- `blocked`, `blocker`, `overdue`, and `urgent` map to high severity
- `delay`, `dependency`, and `missing` map to medium severity
- explicitly supplied risk items without a keyword are reported with low severity and the reason `explicit`
- the reason is `keyword:<first-matching-keyword>` when a keyword is found

There is no LLM, no semantic analysis, no network access, and no write path — the skill only transforms the in-memory items it is given.

## deriveNextTasks

Task derivation is deterministic and builds up to five tasks in this priority order:

1. explicitly supplied `tasks` (reason `explicit`)
2. unchecked Markdown checklist items extracted from item bodies — `- [ ]`, `* [ ]`, or `+ [ ]` single-line entries, in item and line order (reason `markdown_unchecked_task`); checked entries (`[x]`/`[X]`) are ignored
3. a structured fallback for open items that carry at least one operational field (`status`, `owner`, `due`, or non-empty `tags`); done and blocked items are excluded (reason `open_with_due` or `open_item`)

Plain document titles without operational metadata never become tasks, task IDs are deduped first-wins, and no task text is generated. There is no LLM, no network access, and no write path.

`deriveNextTasks` and `createHandoff` share the same unchecked Markdown checkbox extraction helper (`collectMarkdownUncheckedTasks`), so both derive open tasks from identical `- [ ]` / `* [ ]` / `+ [ ]` semantics.

## createHandoff

Handoff assembly is deterministic Markdown heading and list extraction over the supplied items. It always returns the same four sections, in order — **Summary**, **Open Tasks**, **Risks**, **Decisions** — plus the project title and the generation timestamp taken from the input context (`context.now`); the skill never reads the clock.

- the title is inferred from the first supplied item's title, then falls back to an explicit `title`, then to `Project handoff`
- **Summary** collects items under the normalized headings `summary`, `overview`, `current objective`, `objective`, `active`, `current status`, and `next milestone`; when no Markdown summary content exists it falls back to an explicit `summary`, then to `No project summary found.`
- **Open Tasks** combines explicitly supplied `tasks`, unchecked Markdown checkboxes, and structured operational items (with `status`, `owner`, `due`, or non-empty `tags`, excluding done and blocked); checked boxes and plain document titles are never tasks
- **Risks** collects items under the normalized headings `risk`, `risks`, `blocked`, `blocker`, `blockers`, `constraint`, `constraints`, and `delivery constraints`, after any explicitly supplied `risks`
- **Decisions** collects items under the normalized headings `decision`, `decisions`, and `decision log`, after any explicitly supplied `decisions`

Headings match after normalization (trim, lowercase, collapse whitespace, drop a trailing colon), fenced code blocks are ignored, wrapped list-item continuation lines are merged, and each section is capped at five items deduplicated in first-occurrence order. There is no LLM, no network access, and no write path.
