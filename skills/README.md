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

## extractRisks and deriveNextTasks

`extractRisks` and `deriveNextTasks` delegate to the pure `project-signals`
module for **source-aware, line-level, deterministic** extraction over
explicit Skill input, local Markdown documents, and normalized GitHub items.
There is no LLM, embedding model, fuzzy matcher, or probabilistic scorer, and no
filesystem, environment, network, real-clock, or random access — extraction is a
pure function of the inputs plus `context.now`. Raw provider response objects are
never passed in; the Runtime maps only selected provenance fields into each item.

Risks are line-level (one candidate per recognized risk-heading list item or
explicit marker), never a document-title collapse. Next tasks come from
unchecked Markdown checkboxes, list items under recognized action headings, and
explicit action markers, plus actionable GitHub issues/PRs. English and Persian
headings and markers are recognized by exact normalized match. Checked
(resolved) items and fenced code are excluded, and false-positive guards apply
(`unblocked` is not `blocked`, `riskless` is not `risk`, exact GitHub labels
replace substring matching). GitHub items follow exact label/status rules, an
overdue check from the injected time, one risk/task per item, and repository
records are never next tasks. At most 20 risks and 10 next tasks are returned,
ordered explicit → Markdown → GitHub → generic fallback, with GitHub tasks in
high/medium/low priority buckets.

Both skills emit optional public provenance (`source`, `sourceType`, `url`,
`owner`, `due`, `repository`, `number`, and task `priority`) but never body
text, labels, provider responses, tokens, headers, or transport metadata. See
[the deterministic extraction guide](../docs/deterministic-extraction.md) for
the full rule set.

## createHandoff

Handoff assembly is deterministic Markdown heading and list extraction over the supplied items. It always returns the same four sections, in order — **Summary**, **Open Tasks**, **Risks**, **Decisions** — plus the project title and the generation timestamp taken from the input context (`context.now`); the skill never reads the clock.

- the title is inferred from the first supplied item's title, then falls back to an explicit `title`, then to `Project handoff`
- **Summary** collects items under the normalized headings `summary`, `overview`, `current objective`, `objective`, `active`, `current status`, and `next milestone`; when no Markdown summary content exists it falls back to an explicit `summary`, then to `No project summary found.`
- **Open Tasks** combines explicitly supplied `tasks`, unchecked Markdown checkboxes, and structured operational items (with `status`, `owner`, `due`, or non-empty `tags`, excluding done and blocked); checked boxes and plain document titles are never tasks
- **Risks** collects items under the normalized headings `risk`, `risks`, `blocked`, `blocker`, `blockers`, `constraint`, `constraints`, and `delivery constraints`, after any explicitly supplied `risks`
- **Decisions** collects items under the normalized headings `decision`, `decisions`, and `decision log`, after any explicitly supplied `decisions`

Headings match after normalization (trim, lowercase, collapse whitespace, drop a trailing colon), fenced code blocks are ignored, wrapped list-item continuation lines are merged, and each section is capped at five items deduplicated in first-occurrence order. There is no LLM, no network access, and no write path.
