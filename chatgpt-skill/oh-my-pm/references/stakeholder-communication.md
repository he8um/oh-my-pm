# Reference: Stakeholder Communication

## Purpose

Guide the agent to produce clear, audience-appropriate stakeholder communications across executive, team, technical, and cross-functional contexts — in English and Persian.

## When to use this reference

- User asks for a status report, stakeholder update, or executive summary
- User asks to write an escalation or decision request
- User asks how to communicate bad news or a timeline slip
- User asks for a communication in Persian for a management audience
- User asks to calibrate tone for a specific audience

## Core operating principles

- Lead with the key message. The most important thing goes first, not last.
- Match the audience. An executive update is not an engineering standup.
- Do not bury bad news. State risks and issues directly, then provide the mitigation.
- Make decisions visible. Every status update should make clear what is needed from the reader.
- Be concise. Stakeholders read under time pressure. Respect that.

## Status update structure

```txt
Project: [Name]
Date: [Date]
Status: 🔴 Red / 🟡 Amber / 🟢 Green

Summary:
[2-3 sentences. Lead with the key message: status, what changed, what is at risk.]

What changed this period:
- [Change 1]
- [Change 2]

Key decisions needed:
| Decision | Owner | Due |

Risks:
| Risk | Status (Open / Mitigated) |

Blockers:
- [Blocker — owner — escalation: yes/no]

Next milestones:
| Milestone | Target | Status (On track / At risk / Blocked) |
```

## Audience calibration

### Executive audience

- Status and trend: is this getting better or worse?
- Key decisions required from them: what do they need to approve or decide?
- Budget or timeline impact: if there is one, state it plainly.
- Do not include implementation detail. No sprint metrics, no code references.
- Maximum 300 words for a weekly executive update.

### Team audience

- What is the next action? By whom? By when?
- What blockers need escalation?
- What decisions has leadership made that affect the team?
- Include specifics: task names, owners, deadlines.
- Can be longer — the team needs actionable detail.

### Technical stakeholders

- Technical dependencies, feasibility questions, and risk.
- Precise: latency targets, API contract status, schema changes, rollback approach.
- Preserve technical identifiers exactly: endpoint names, service names, error codes.

### Cross-functional stakeholders

- Shared milestones and dependencies.
- What each function needs from the others.
- Collaborative tone: we are solving a shared problem.

## Escalation format

When escalating a blocker or risk:

```txt
Escalation: [What is being escalated]
Impact: [What happens if not resolved — timeline, scope, quality]
Options: [What can be done — at least 2 options with trade-offs]
Decision needed: [What the escalation recipient needs to decide]
Owner: [Who is accountable for the decision]
By: [When the decision is needed]
```

Do not escalate without options. An escalation that only describes a problem shifts the burden without helping the decision-maker.

## Decision request format

```txt
Decision requested: [Specific question — binary or multiple choice]
Context: [Why this decision is needed now — brief]
Options:
  A: [Option] — [Trade-off]
  B: [Option] — [Trade-off]
Recommendation: [Which option and why — be direct]
Owner: [Who decides]
By: [When]
```

## Communicating bad news

When a milestone will slip or a risk has materialized:

1. State the fact directly: "The launch date is at risk."
2. Explain why: one or two sentences. No blame.
3. State the impact: what does this affect?
4. Present options: at least two — with their trade-offs.
5. State a recommendation if you have one.
6. State what you need from the reader.

Do not soften bad news to the point that the reader does not understand the situation is serious.

## Persian stakeholder communication

When writing for a Persian-speaking management audience:

- Use natural, professional Persian. Not machine translation.
- Preserve English for technical identifiers (API, rollback, QA, CI/CD, sprint, KPI).
- Use Persian for management language: وضعیت (status), مالک (owner), ریسک (risk), بلاکر (blocker), اسکالیشن (escalation).
- Use RAG status emoji consistently: 🔴 قرمز / 🟡 زرد / 🟢 سبز.

Example Persian executive update (opening):

```txt
**وضعیت:** 🟡 زرد

یکپارچه‌سازی در پیشرفت است اما تأخیر vendor در ارائه sandbox credentials پنجره QA را فشرده کرده است.
در صورت عدم حل تا پایان این هفته، تاریخ لانچ در ریسک قرار می‌گیرد.
```

## Tone control

| Situation | Tone |
| --- | --- |
| Routine Green status | Factual, brief |
| Amber status | Direct, present options, action-oriented |
| Red status | Urgent, clear, options with trade-offs, escalation explicit |
| Escalation to executive | Respectful, direct, no waffling |
| Team update | Collaborative, specific, actionable |
| External stakeholder | Professional, measured, clear on what is needed |

## Common mistakes to avoid

- Leading with context before the key message
- Sending Amber or Red status without options or a recommended action
- Using technical language in executive updates
- Escalating without stating options — just describing the problem
- Writing Persian status reports with literal English translations
- Padding updates with filler that delays the key message

## Token efficiency note

Status updates are not narratives. Use the structure above. Do not write long paragraphs if a table or bullet list communicates the same information in fewer words.
