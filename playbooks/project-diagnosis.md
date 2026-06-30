# Playbook: Project Diagnosis

## Purpose

Produce an honest assessment of a project's current state — including RAG status, risks, critical path, and recommended next actions.

## When to use

- A project is in trouble or showing warning signs
- A key milestone is approaching and readiness is unclear
- You are taking over a project and need to establish current state
- A stakeholder has asked for status and you need to produce an accurate assessment

## Inputs needed

```txt
Project brief or PRD
Current milestone list and status
Open blockers
Recent decisions and open decisions
Team capacity information
Stakeholder expectations (what have we committed to?)
```

## Fast-start questions

1. "What was supposed to happen by now that hasn't?"
2. "What is the one thing that, if unresolved this week, will cause the launch to slip?"
3. "What has been decided that we are not revisiting? What is still open?"
4. "What does the critical path look like — and how much buffer remains?"
5. "Who knows something important that has not been said in this conversation?"

## Recommended process

1. **Establish current state** — Phase, percent complete, what has shipped.
2. **List all open blockers** — Not risks. Actual stops. Work that cannot proceed.
3. **Identify the critical path** — What sequence of work determines the earliest completion? Protect it first.
4. **Assess RAG status** — Apply the criteria below. Be honest. Amber is not failure.
5. **Surface top 3 risks** — Likelihood, impact, mitigation, owner.
6. **List open decisions** — Who owns each? What is the deadline?
7. **Recommend immediate actions** — One owner per action. Time-bound.

## RAG status rules

| Status | Criteria | Action |
| --- | --- | --- |
| 🟢 Green | On track. Risks manageable. No critical blockers. | Maintain cadence. |
| 🟡 Amber | At risk. One+ blocker or open risk. Recoverable with action. | Surface immediately. Escalate if unresolved within 24h. |
| 🔴 Red | Off track. Timeline or scope at serious risk. Escalation required. | Escalate to executive sponsor. Present options. |

**Move to Amber when:** a blocker appears, a milestone slips, or a key decision has been missed.

**Move to Red when:** the critical path is broken and recovery requires scope or timeline negotiation.

## Output structure

```txt
Status: 🟡 Amber — [one-line rationale]

Top 3 risks:
| Risk | Likelihood | Impact | Mitigation | Owner |

Critical path:
1. [Step] — [Owner] — [Target date]
2. ...

Blockers:
- [Blocker] — [Owner] — Escalation: yes/no

Open decisions:
| Decision | Owner | Deadline |

Recommended next action: [Specific action — Owner — By when]
```

## Decision rules

- If the buffer is zero, status is Amber at minimum.
- If a blocker has been open for more than one working day with no movement, escalate.
- If there are critical-path items with no owner, that is the first thing to fix.
- If the stakeholder expectation and current trajectory do not match, say so explicitly.

## Risk checks

- Is the critical path correctly identified? (Protecting the wrong path wastes effort.)
- Are blockers vs risks correctly separated? (A blocker stops work now. A risk might stop it later.)
- Is the buffer real? (Buffer built on optimistic assumptions is not buffer.)

## Quality checklist

- [ ] RAG status has a one-line rationale
- [ ] Critical path is a numbered sequence with owners and dates
- [ ] Each risk has likelihood, impact, mitigation, and owner
- [ ] Each blocker has an escalation decision
- [ ] Recommended next action is specific and time-bound

## Common mistakes

- Diagnosing without first understanding the critical path
- Listing risks without mitigation
- Marking all blockers as "team will resolve" without escalation decision
- Green status when buffer is zero
- Output that describes the problem without recommending action

## Bilingual note

For Persian output: مسیر بحرانی (critical path), بلاکر (blocker), اسکالیشن (escalation), مالک (owner). RAG: 🔴 قرمز / 🟡 زرد / 🟢 سبز.

## Related templates

- `templates/en/status-report.md`
- `templates/fa/گزارش وضعیت`
- `templates/en/risk-register.md`

## Related scenarios

- `tests/scenarios/en-project-diagnosis.md`
- `tests/scenarios/fa-project-diagnosis.md`
