# Reference: Risk Management

## Purpose

Guide the agent to identify, assess, manage, and track risks proactively across all delivery contexts — distinguishing risks from blockers, assigning owners, and applying RAG status rules.

## When to use this reference

- User asks for a risk review, risk register, or risk assessment
- User shares a project context and asks what can go wrong
- User asks about a specific risk and how to mitigate it
- User asks for RAG status with risk rationale
- User asks to distinguish risks from blockers or issues

## Core operating principles

- Surface risks before they become blockers. A risk is probable. A blocker is actual.
- Every risk needs an owner. Unowned risks are not managed.
- Assess likelihood and impact separately. A low-likelihood, high-impact risk may still warrant mitigation.
- Mitigation is not the same as monitoring. "We will watch it" is not a mitigation.
- Review risks at every milestone. Risks change as the project progresses.

## Risk vs blocker vs issue

| Term | Definition | Action |
| --- | --- | --- |
| Risk | Something that might happen and would harm the project | Mitigate proactively |
| Blocker | Work is actively stopped — cannot proceed | Escalate immediately |
| Issue | A risk that has materialized | Treat as a blocker; activate mitigation |

Do not conflate these. "We have a risk that QA will be blocked" and "QA is blocked" require different responses.

## Risk register format

| # | Risk | Likelihood | Impact | Score | Mitigation | Contingency | Owner | Trigger | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [Description] | High/Med/Low | High/Med/Low | [Critical/High/Med/Low] | [Action to reduce probability or impact] | [What to do if it happens] | [Name] | [What event would confirm this risk is materializing] | Open/Mitigated/Closed |

## Risk scoring

| Likelihood | Impact | Score |
| --- | --- | --- |
| High | High | Critical |
| High | Medium | High |
| Medium | High | High |
| Medium | Medium | Medium |
| Low | High | Medium |
| Low | Low | Low |

Critical risks require immediate escalation and a contingency plan, not just mitigation.

## Risk categories

### Scope risk

- Requirements are unclear or changing
- Non-goals not defined — anything could be in scope
- Stakeholders have different expectations of the deliverable

### Delivery risk

- Timeline is aggressive relative to capacity
- Dependencies are on the critical path and unconfirmed
- Key person risk: only one person can do critical work
- Team is new to the technology or domain

### Technical risk

- Feasibility not confirmed before commitment
- API or integration SLA not validated
- Performance requirements not specified
- Rollback plan not feasible or too costly

### Stakeholder risk

- Executive sponsor not aligned on scope or timeline
- Key decision-maker not available for decisions
- Multiple stakeholders with conflicting priorities

### External risk

- Vendor or third-party dependency with unknown delivery date
- Regulatory approval required with uncertain timeline
- Market or competitive event that changes priority

## Mitigation vs contingency

- **Mitigation**: what you do to reduce the probability or impact of the risk occurring.
- **Contingency**: what you do if the risk materializes despite mitigation.

Both must be defined for Critical and High risks.

Example:

```txt
Risk: Vendor sandbox credentials delayed by 2+ weeks
Mitigation: Escalate to vendor executive contact today; begin testing with mock data in parallel
Contingency: If credentials not received by end of week 4, negotiate launch date or reduce scope to non-payment features
Owner: PM
Trigger: No vendor response by end of day tomorrow
```

## RAG status rules

| Status | Risk condition | Action |
| --- | --- | --- |
| 🟢 Green | No critical or high open risks; all mitigations in place | Maintain cadence |
| 🟡 Amber | One or more high risks open; mitigation in progress | Weekly escalation to sponsor |
| 🔴 Red | Critical risk open or materialized; critical path at risk | Immediate escalation; present options |

Move to Red when: a risk is Critical score AND mitigation is not working AND the critical path is affected.

## Trigger definition

A trigger is the observable event that tells you a risk is materializing:

- "Vendor has not responded by end of Wednesday" → trigger for sandbox credential risk
- "Design sign-off is not complete by kickoff date" → trigger for engineering start delay
- "QA finds more than 5 critical defects in first round" → trigger for launch date risk

Define triggers when you define risks. Do not wait for a risk to fully materialize before acting.

## Risk review cadence

- At project kickoff: identify top 5 risks; assign owners and mitigations
- At each milestone: review the risk register; close mitigated risks; add new ones
- When status changes to Amber: review full register with sponsor
- When status changes to Red: escalate immediately; present options

## Common mistakes to avoid

- Listing risks without assigning owners
- Treating monitoring as mitigation ("we'll keep an eye on it")
- Not defining triggers — acting only after a risk fully materializes
- Conflating risk with blocker in status reports
- Leaving Critical risks open without a contingency plan
- Not revisiting the risk register after milestones

## Bilingual note

In Persian: ریسک (risk), بلاکر (blocker), اسکالیشن (escalation), احتمال (likelihood), تأثیر (impact), مالک (owner), اقدام کاهشی (mitigation). Risk score terms: بحرانی (critical), زیاد (high), متوسط (medium), کم (low).
