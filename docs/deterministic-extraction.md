# Deterministic project-signal extraction

OH MY PM extracts project **risks** and **next tasks** from local Markdown
documents and GitHub repository context using a pure, rule-based, deterministic
layer. There is no LLM, embedding model, semantic paraphrase understanding,
fuzzy matcher, or probabilistic scorer anywhere in this path. The same inputs
plus the same injected timestamp always produce deep-equal output.

All extraction runs in the Skill layer over normalized inputs and
`SkillInputEnvelope.context.now`. It performs no filesystem, environment,
network, random, or real-clock access, and never receives raw provider response
objects — the Runtime maps only selected provenance fields into each item.

## Sources

Each risk or next-task candidate records its source:

- `structured` — an explicit `risks`/`tasks` entry in the Skill input
- `markdown` — a line in a local Markdown document
- `github-repository` — a normalized GitHub repository record
- `github-issue` / `github-pull-request` — a normalized GitHub issue or PR
- `generic` — a non-GitHub, non-document item in the controlled fallback

## Markdown extraction

Documents are parsed line by line (one-based line numbers, document order
preserved). Fenced code blocks and fence markers are ignored, checkbox state is
preserved, and list continuation lines are merged. Content before the first
heading is ignored except explicit line markers.

### Risk headings (English and Persian)

Exact, normalized heading matches drive risk extraction. High severity:
`blockers`, `blocked`, `issues and blockers`, `موانع`, `مانع`, `بلاکرها`.
Medium: `risks`, `risk register`, `open risks`, `dependencies`, `ریسک`,
`ریسک‌ها`, `وابستگی‌ها`. Low: `concerns`, `known issues`, `نگرانی‌ها`,
`مشکلات شناخته‌شده`.

Each list item, numbered item, or unchecked checklist entry under a recognized
risk heading becomes its own **line-level** risk (never a document-title
collapse). A narrative paragraph under a risk heading becomes a single risk only
when that section has no list or checklist items. **Checked** checklist entries
are treated as resolved and excluded.

### Risk and action markers

Explicit inline markers are recognized at the start of a line (after optional
bullet syntax) as an exact prefix plus a colon. Risk markers: `Risk:`,
`Blocker:`, `Blocked by:`, `Dependency:`, `Concern:`, `Known issue:`, and their
Persian equivalents (`ریسک:`, `مانع:`, `مسدودکننده:`, `وابستگی:`, `نگرانی:`,
`مشکل شناخته‌شده:`). Action markers: `Next:`, `Next step:`, `Action:`,
`Action item:`, `Todo:`, `Task:`, and Persian equivalents (`بعدی:`,
`گام بعدی:`, `اقدام:`, `اقدام بعدی:`, `کار:`, `وظیفه:`, `تسک:`). Arbitrary inline
occurrences never match. The prefix is stripped from the displayed title.

### Task headings and priority markers

Next tasks come, in order, from: explicit `tasks` input, unchecked checklist
entries, list items under recognized action headings (`next`, `next steps`,
`action items`, `tasks`, `todo`, `active work`, `اقدامات بعدی`, `کارهای بعدی`,
…), explicit action markers, and a controlled generic fallback. Checked tasks
and items inside risk sections are never tasks, and arbitrary prose is never a
task.

Leading priority markers are supported and stripped from the title:
`[P0]`/`P0:`/`Critical:`/`Urgent:`/`بحرانی:`/`فوری:` → high;
`[P1]`/`P1:`/`High:`/`بالا:` → medium; `[P2]`/`P2:`/`Medium:`/`Low:`/`متوسط:`/
`پایین:` → low.

## GitHub extraction

### Label taxonomy (exact, normalized)

Labels are normalized (lowercased, Arabic/Persian unification, `_`/`/`/repeated
`-` folded to `-`) and matched exactly — never by substring.

- High: `blocker`, `blocked`, `critical`, `security`, `urgent`, `p0`,
  `priority-critical`, `priority-high`, `sev0`, `sev1`
- Medium: `risk`, `dependency`, `waiting`, `waiting-on`, `needs-info`,
  `needs-information`, `p1`, `priority-medium`, `sev2`
- Low: `risk-low`, `p2`, `priority-low`, `sev3`
- No-action (exclude from next tasks): `duplicate`, `invalid`, `wontfix`,
  `won't-fix`, `not-planned`

### Repository records

A GitHub repository record is never a next task. It becomes a risk only when
`archived` (medium, `github_repository:archived`) or `disabled` (high,
`github_repository:disabled`). Open-issue count alone is not a risk.

### One risk per issue/PR (precedence)

At most one risk is produced per GitHub issue/PR, using this exact precedence:
overdue open item → blocked state/label → first high label → body blocker
heading/marker → first medium label → body risk/dependency heading/marker →
first low label → body concern heading/marker → bounded exact title phrase.
Word/phrase boundaries are always used, so `unblocked` never matches `blocked`
and `riskless` never matches `risk`. Body keywords outside recognized headings
or markers never count. Closed and merged items are never overdue.

### Next tasks

Eligible items are open issues and open/draft pull requests. Excluded:
repository records, closed/merged/done/resolved/cancelled items, no-action
labels, blocked items, and empty titles. Priority: overdue or high label →
high; medium label, a valid due date, or (for a PR) requested reviewers →
medium; otherwise low. GitHub tasks are ordered high → medium → low, each bucket
in provider order (never sorted by title, number, date, or locale).

## Overdue inference

Overdue is computed only from the injected `now`. Date-only due values are
anchored to `23:59:59.999Z`; timestamps must carry a timezone; invalid dates and
an invalid `now` disable overdue inference. There is no `Date.now()` and no
machine-timezone inference.

## Limits and ordering

At most **20 risks** and **10 next tasks** are returned. Risks are ordered:
explicit structured, then Markdown (document/line order), then GitHub (provider
order), then generic fallback. Tasks follow the same ordering with GitHub
priority buckets. Deduplication is by candidate id, plus document-id + normalized
title for Markdown and original source id for GitHub; the first occurrence wins,
and the limit is applied after ordering and dedupe. Source arrays are never
sorted or mutated.

## False-positive protections

- Arbitrary prose is never a task, and a document is never collapsed into one
  risk.
- Fenced code is ignored; checked checklist entries are excluded.
- `unblocked` does not match `blocked`; `riskless` does not match `risk`.
- Exact label matching replaces substring matching.
- Raw provider data is never passed into the Skill layer.

## Limitations

- No arbitrary prose task generation and no semantic paraphrase understanding.
- No comments, review comments, or timeline analysis.
- No write-back — extraction is strictly read-only.
