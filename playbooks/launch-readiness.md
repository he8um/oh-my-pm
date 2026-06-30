# Playbook: Launch Readiness

## Purpose

Assess go/no-go readiness for a product or campaign launch before committing to a launch date or execution.

## When to use

- A launch date is approaching and readiness is unclear
- A go/no-go decision meeting is scheduled
- A launch was recently blocked and readiness must be re-assessed
- A stakeholder is asking if we are ready to launch

## Inputs needed

```txt
Launch scope and acceptance criteria
QA or sign-off status
Rollback plan
Support and operations readiness
Communications status
Monitoring and alerting setup
```

## Fast-start questions

1. "Is there an approved rollback plan? Has it been tested?"
2. "Has QA signed off on all Must have acceptance criteria?"
3. "Are support and ops teams briefed on new behavior and known issues?"
4. "Is monitoring in place for the most important signals?"
5. "Who has authority to call a rollback if needed?"

## Go/no-go decision format

```txt
Launch: [Name / version]
Date: [Proposed launch date]
Decision: Go / No-go / Conditional go
Owner: [Who has decision authority]
Criteria met: Yes / Partially / No — [detail]
Conditions (if conditional): [What must be true before launch]
Rollback plan: [Location or summary]
```

## Launch readiness checklist

### Engineering / Product

- [ ] All Must have features complete and tested against acceptance criteria
- [ ] QA sign-off received from QA lead or PM
- [ ] Performance tested at expected load (if applicable)
- [ ] Security review complete (RBAC, authentication, data exposure — if applicable)
- [ ] Rollback plan documented with step-by-step procedure
- [ ] Rollback authority defined (who can call it)
- [ ] Rollback tested in staging (if applicable)
- [ ] Monitoring and alerting in place for key signals
- [ ] CI/CD pipeline green on release branch
- [ ] Deployment runbook current and tested

### Marketing / Communications

- [ ] Launch messaging approved
- [ ] All campaign assets complete and reviewed
- [ ] App store or platform listing submitted (review time factored in)
- [ ] Internal communications sent
- [ ] Press or media outreach ready (if applicable)
- [ ] Social media content scheduled

### Support and Operations

- [ ] Support team briefed on new behavior and changes
- [ ] Known issues and workarounds documented for support
- [ ] FAQ updated
- [ ] Escalation path for edge cases defined
- [ ] On-call rotation confirmed for launch window

### Rollback planning

A rollback plan must answer:

1. Who has authority to call a rollback?
2. What is the rollback procedure? (step-by-step)
3. How long does rollback take?
4. What is the data impact? (migrations, user state)
5. How do we verify rollback succeeded?

A launch without a tested rollback plan is a risk accepted, not eliminated.

## RAG status for launch readiness

| Status | Criteria |
| --- | --- |
| 🟢 Go | All checklist items complete. No blocking issues. Rollback plan tested. |
| 🟡 Conditional go | Minor items outstanding. Conditions defined. Launch owner accepts risk. |
| 🔴 No-go | One or more blocking items outstanding (QA not complete, no rollback plan, monitoring not in place). |

## Quality checklist

- [ ] Go/no-go decision is documented with owner
- [ ] All blocking checklist items resolved before go decision
- [ ] Rollback plan is documented (not just "we'll roll back if needed")
- [ ] Support team briefed before launch (not at launch)
- [ ] Post-launch monitoring plan in place

## Common mistakes

- Approving go without a documented rollback plan
- Briefing support team at launch instead of before it
- Missing QA sign-off — only engineering sign-off received
- Not factoring platform review time into the launch calendar
- Monitoring added after launch instead of before

## Bilingual note

In Persian: رول‌بک (rollback), لانچ (launch), تأیید گو (go approval), وضعیت آمادگی (readiness status).

## Related templates

- `templates/en/decision-log.md`
- `templates/en/status-report.md`
