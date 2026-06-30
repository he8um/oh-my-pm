# Playbook: Stakeholder Update

## Purpose

Prepare and deliver clear, audience-appropriate stakeholder updates — English or Persian, executive or team.

## When to use

- Weekly or bi-weekly status cadence
- A milestone has been reached or missed
- A risk has materialized and needs to be communicated
- An escalation or decision request needs to be delivered
- The project is moving from Green to Amber or Amber to Red

## Inputs needed

```txt
Current project status (RAG)
What changed since the last update
Open blockers
Decisions needed from this audience
Top risks (current status)
Next milestones with owners and dates
Audience (executive / team / cross-functional / external)
```

## Audience calibration

| Audience | Focus | Tone | Length |
| --- | --- | --- | --- |
| Executive sponsor | Status trend, decisions, timeline/budget impact | Direct, no jargon | 150-250 words |
| Cross-functional team | Shared milestones, dependencies, what you need from them | Collaborative | 200-350 words |
| Engineering team | What to build, blockers, escalation path | Specific, technical detail OK | 200-400 words |
| External stakeholder | What affects them, what you need from them | Professional, measured | 150-250 words |

## Status update structure

```txt
Project: [Name]
Date: [Date]
Status: 🟢 Green / 🟡 Amber / 🔴 Red

Summary:
[2-3 sentences. Lead with the key message: status, trend, what is at risk.]

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

## Escalation format

```txt
Escalation: [What is being escalated]
Impact: [What happens if unresolved — timeline, scope, quality]
Options:
  A: [Option] — [Trade-off]
  B: [Option] — [Trade-off]
Decision needed: [What the recipient needs to decide]
Owner: [Who decides]
By: [When]
```

Do not escalate without options. An escalation that only describes a problem shifts burden without helping the decision-maker.

## Decision request format

```txt
Decision requested: [Specific question — binary or multiple choice]
Context: [Why now — brief]
Options:
  A: [Option] — [Trade-off]
  B: [Option] — [Trade-off]
Recommendation: [Which option and why]
Owner: [Who decides]
By: [When]
```

## Communicating bad news

1. State the fact directly: "The launch date is at risk."
2. Explain why — two sentences. No blame.
3. State the impact.
4. Present options with trade-offs.
5. State a recommendation if you have one.
6. State what you need from the reader.

Do not soften bad news to the point where the reader does not understand the situation is serious.

## Persian stakeholder communication

For Persian-speaking management audiences:

- Use natural, professional Persian — not machine translation.
- Preserve English for technical identifiers: API, rollback, QA, CI/CD, sprint, KPI.
- Use Persian management terms: وضعیت (status), مالک (owner), ریسک (risk), بلاکر (blocker), اسکالیشن (escalation).
- RAG in Persian: 🔴 قرمز / 🟡 زرد / 🟢 سبز.
- Lead the summary with the key message, as in English.

## Quality checklist

- [ ] Summary leads with the key message (not with context)
- [ ] RAG status has a one-line rationale
- [ ] Decisions needed are explicit with owners and deadlines
- [ ] Bad news is stated directly (not buried)
- [ ] Escalation includes options, not just the problem
- [ ] Length is calibrated to the audience

## Common mistakes

- Leading with context before the key message
- Sending Amber status without options or a recommended action
- Using technical language in executive updates
- Escalating without stating options
- Persian updates that are literal translations

## Token efficiency note

Status updates are not narratives. Use the structure above. A table communicates the same information as three paragraphs in half the tokens.

## Related templates

- `templates/en/status-report.md`
- `templates/fa/status-report.md`

## Related scenarios

- `tests/scenarios/en-project-diagnosis.md`
