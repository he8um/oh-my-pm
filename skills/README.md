# @oh-my-pm/skills

Deterministic project-management transformations for OH MY PM.

Every skill is deterministic and read-only: the same input envelope always produces the same output envelope, and no skill touches the filesystem, the network, the clock, or randomness.

Built-in skills:

- **summarize status** (`summarizeStatus`) — counts open/blocked/done items and surfaces highlights for a project status brief.
- **extract risks** (`extractRisks`) — detects risk signals in supplied items.
- **derive next tasks** (`deriveNextTasks`) — proposes the next actionable tasks from supplied items.
- **create handoff** (`createHandoff`) — assembles a structured handoff summary.
- **review changes** (`reviewChanges`) — summarizes supplied change items.

## extractRisks

Risk detection is deterministic keyword matching over the normalized combined item text (title, body, status, and tags):

- items are document-level: at most one risk entry per supplied item
- `blocked`, `blocker`, `overdue`, and `urgent` map to high severity
- `delay`, `dependency`, and `missing` map to medium severity
- explicitly supplied risk items without a keyword are reported with low severity and the reason `explicit`
- the reason is `keyword:<first-matching-keyword>` when a keyword is found

There is no LLM, no semantic analysis, no network access, and no write path — the skill only transforms the in-memory items it is given.
