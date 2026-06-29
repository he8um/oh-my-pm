# Reference: Project Management

## Purpose

Guide the agent to apply structured project management thinking: intake, diagnosis, scope control, stakeholder mapping, milestones, decisions, and status reporting.

## When to use this reference

- User asks to analyze, plan, or diagnose a project
- User shares a project brief, PRD, or project context and asks for PM guidance
- User needs a status report, milestone plan, or RACI
- User asks about scope, dependencies, or change control

## Core operating principles

- Diagnose before prescribing. Understand current state before recommending action.
- Scope is a boundary, not a list. Explicit non-goals matter as much as goals.
- Every decision needs an owner. Undecided decisions block delivery.
- Risks are probable future blockers. Surface them before they happen.
- Status reporting is a communication act. Lead with the key message.

## Project intake — what to collect

Before producing any plan, understand:

| Signal | Question |
| --- | --- |
| Problem | What problem does this project solve? Why now? |
| Goal | What does success look like? Is it measurable? |
| Scope | What is in? What is explicitly out? |
| Constraints | Time, budget, team, technology limits? |
| Stakeholders | Who decides? Who is affected? Who must be consulted? |
| Dependencies | What must happen first, externally or internally? |
| Timeline | Hard deadline? Soft target? What drives the date? |

If any of these are missing, flag them as open decisions before proceeding.

## Project diagnosis structure

When diagnosing a project, produce:

```txt
Status: 🔴 Red / 🟡 Amber / 🟢 Green — [one-line rationale]

Top risks:
| Risk | Likelihood | Impact | Mitigation | Owner |

Critical path:
1. [Step] — [Owner] — [Date]
2. ...

Blockers:
- [Blocker] — [Owner] — [Escalation needed: yes/no]

Open decisions:
- [Decision] — [Owner] — [Deadline]

Recommended next action: [One specific action, owner, timeframe]
```

RAG status rules:

- 🟢 Green: on track, no critical open risks, decisions moving
- 🟡 Amber: at risk but recoverable; at least one open blocker or unresolved risk
- 🔴 Red: timeline or scope at serious risk; immediate escalation needed

## Scope control

When scope expands:

1. Name the new item explicitly.
2. Assess impact on timeline, team, and risk.
3. Present the trade-off: accept scope change and adjust timeline/resources, or defer.
4. Do not silently absorb scope — surface it.

Non-goals belong in the project brief. If they are absent, add them.

## Stakeholder mapping

| Role | Name | Involvement |
| --- | --- | --- |
| Executive sponsor | | Approves budget and direction |
| DRI (Directly Responsible Individual) | | Accountable for delivery |
| PM | | Plans and coordinates |
| Consulted | | Input required, not decision |
| Informed | | Receives updates only |

RACI is optional but useful when there are many stakeholders. Do not use it when two people are enough.

## Milestones

A milestone is a meaningful checkpoint, not a task list item. Good milestones are:

- Named: "QA complete" not "testing done"
- Dated: target date, not "soon"
- Owned: one DRI
- Binary: done or not done

Include dependencies between milestones on the critical path.

## Decision log

Log decisions using this format:

```txt
Decision: [What was decided]
Date: [When]
Owner: [Who decided or approved]
Rationale: [Why — constraints, trade-offs, alternatives considered]
Status: Decided / Pending / Superseded
Impact: [What this affects]
```

Log both decided and pending decisions. Pending decisions block planning.

## Change control

When a request would change the plan:

1. Document the change: what, why, who is asking.
2. Assess impact on scope, timeline, and team.
3. Present options: accept with adjustment, defer, or reject with reason.
4. Record the decision in the decision log.

Never absorb a change silently.

## Definition of done

For each deliverable, define "done" before work starts:

- What criteria must be met?
- Who signs off?
- Is there a QA or review step?

Ambiguous done criteria create rework and scope disputes.

## Common mistakes to avoid

- Diagnosing without understanding constraints first
- Presenting a plan without surfacing open decisions
- Treating a milestone as done before sign-off is complete
- Letting scope expand without assessing impact
- Writing status reports that bury bad news

## Bilingual note

In Persian: مسیر بحرانی (critical path), مالک (owner), ددلاین (deadline), اسکوپ (scope), استیک‌هولدر (stakeholder). See `glossary/fa-en.md` for full conventions.
