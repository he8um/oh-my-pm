# Playbook: Risk Review

## Purpose

Identify, assess, and actively manage risks before they become blockers or issues.

## When to use

- At project kickoff — establish the risk baseline
- At each major milestone — risks change as the project evolves
- When status changes to Amber — review the full register
- After a blocker is resolved — assess whether it created new risks

## Inputs needed

```txt
Current project brief or delivery plan
Recent status reports
Open blockers (to distinguish from risks)
Team input on what could go wrong
External dependency list
```

## Blocker vs risk vs issue

| Term | Definition | Action |
| --- | --- | --- |
| Risk | Something that might happen and would harm the project | Mitigate proactively |
| Blocker | Work is actively stopped — cannot proceed now | Escalate immediately |
| Issue | A risk that has materialized | Treat as blocker; activate contingency |

Do not conflate these. "We have a risk that QA will be blocked" and "QA is blocked" require different responses.

## Recommended process

1. **List all known risks** — Do not filter yet. Get everything on the table.
2. **Assess each risk** — Likelihood (High/Med/Low) and Impact (High/Med/Low).
3. **Score and rank** — Use the matrix below.
4. **Assign mitigation and contingency** — For every open risk: what do we do to prevent it, and what do we do if it happens?
5. **Name an owner** — Each risk has one owner. Not a team.
6. **Define a trigger** — The observable event that signals this risk is materializing.
7. **Escalate Critical risks** — Immediately. Do not wait for a review meeting.
8. **Close resolved risks** — Document how they were resolved.

## Risk scoring matrix

| Likelihood | Impact | Score |
| --- | --- | --- |
| High | High | Critical |
| High | Medium | High |
| Medium | High | High |
| Medium | Medium | Medium |
| Low | High | Medium |
| Low | Low | Low |

Critical risks require immediate escalation and a contingency plan.

## Risk register format

| # | Risk | Likelihood | Impact | Score | Mitigation | Contingency | Owner | Trigger | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [Description] | High/Med/Low | High/Med/Low | Critical/High/Med/Low | [Action] | [If it happens] | [Name] | [Observable event] | Open |

## Risk categories to check

- **Scope:** Requirements unclear or changing; non-goals challenged
- **Delivery:** Timeline aggressive; dependency unconfirmed; key person risk
- **Technical:** Feasibility not validated; API SLA unknown; rollback not feasible
- **Stakeholder:** Decision-maker unavailable; conflicting priorities
- **External:** Vendor delay; regulatory approval; market event

## Mitigation vs contingency

- **Mitigation:** What you do to reduce probability or impact before the risk occurs.
- **Contingency:** What you do if the risk materializes despite mitigation.

Both must be defined for Critical and High risks.

## Trigger definition

A trigger is the observable event that signals a risk is materializing:

- "Vendor has not responded by end of Wednesday"
- "Design sign-off not complete by kickoff date"

Define triggers when you define risks. Do not wait for full materialization.

## Quality checklist

- [ ] Each risk has likelihood, impact, and score
- [ ] Critical and High risks have both mitigation AND contingency
- [ ] Each risk has exactly one owner
- [ ] Each risk has a trigger defined
- [ ] Blockers are listed separately from risks
- [ ] Critical risks have been escalated

## Common mistakes

- Listing risks without owners ("the team will handle it")
- Treating monitoring as mitigation ("we'll keep an eye on it")
- No triggers — acting only after full materialization
- Not separating blockers from risks in status reports
- Forgetting to close risks that were mitigated

## Bilingual note

In Persian: ریسک (risk), بلاکر (blocker), مالک (owner), احتمال (likelihood), تأثیر (impact), اقدام کاهشی (mitigation), اقدام اضطراری (contingency), محرک (trigger).

## Related templates

- `templates/en/risk-register.md`
- `templates/fa/risk-register.md`

## Related scenarios

- `tests/scenarios/en-project-diagnosis.md`
