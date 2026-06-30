# Playbook: PRD Review

## Purpose

Identify gaps, ambiguities, and risks in a PRD before engineering begins.

## When to use

- Engineering is about to start work on a new feature
- A PRD has been written and needs review before sprint planning
- A feature is being scoped and the requirements are incomplete

## Inputs needed

```txt
Draft PRD (or requirements document)
Team size and timeline
Existing acceptance criteria (if any)
Known technical constraints
```

## Fast-start questions

1. "What specific user behavior is this feature changing?"
2. "How will QA know when this feature is done?"
3. "What is the measurable success target — not the direction, the number?"
4. "What is explicitly out of scope for this feature?"
5. "What does rollback look like if this goes wrong?"

## Recommended process

1. **Check the problem statement** — Is it specific? Does it identify a user, a context, and an observable pain?
2. **Check the goal** — Is it measurable? Is there a target value and baseline?
3. **Check scope and non-goals** — Are non-goals listed? Without them, scope is implicit and unbounded.
4. **Review acceptance criteria** — Are they testable? Can QA sign off without guessing?
5. **Check dependencies** — Are all external dependencies named with owners and status?
6. **Review risks** — Are technical and product risks documented with mitigation?
7. **Check success metrics** — Is there a target? A measurement method? A baseline?
8. **Review open questions** — Are unresolved decisions tracked with owners and deadlines?

## PRD gap severity

| Gap | Severity | Action |
| --- | --- | --- |
| No acceptance criteria | Blocking | QA planning cannot start. Fix before sprint. |
| No measurable success metric | Blocking | Cannot declare success. Fix before sprint. |
| No non-goals | High | Scope creep risk. Add before sprint. |
| Vague requirements ("improve performance") | High | Rewrite with specific, measurable criteria. |
| Dependencies not identified | High | Escalation risk. Confirm all dependencies before sprint. |
| No risk documentation | Medium | Add top 3 risks with mitigation. |
| No approval signatures | Medium | Confirm who signed off before engineering starts. |

## Acceptance criteria quality bar

A good acceptance criterion is:

- Specific: describes observable behavior, not intent
- Testable: a QA engineer can verify it without guessing
- Bounded: has a performance or quality threshold where relevant

Weak: "Notifications should be delivered quickly."
Strong: "Push notification delivered within 30 seconds of trigger event in 95% of cases."

## Success metric quality bar

A good success metric has:

- A direction (increase, decrease)
- A specific value (30%, not "significantly")
- A baseline (current value before the change)
- A timeframe (within 60 days of launch)

Weak: "Reduce support tickets."
Strong: "Reduce support tickets related to missed notifications by 30% within 60 days of launch. Baseline: current ticket volume confirmed with support team."

## Quality checklist

- [ ] Problem statement identifies user, context, and pain
- [ ] Goal is measurable with a target value
- [ ] Non-goals are listed and agreed
- [ ] All requirements have acceptance criteria
- [ ] Success metric has baseline, target, and measurement method
- [ ] All dependencies are named with owners and status
- [ ] Top 3 risks documented with mitigation
- [ ] Open questions tracked with owners and deadlines

## Common mistakes

- Approving a PRD with "improve user experience" as a goal
- Missing acceptance criteria discovered during QA (forces rework)
- Non-goals missing because "everyone already knows"
- Success metrics defined after launch instead of before
- Assuming dependencies are confirmed without verifying

## Related templates

- `templates/en/prd.md`
- `templates/fa/prd.md`

## Related scenarios

- `tests/scenarios/product-prd-review.md`
