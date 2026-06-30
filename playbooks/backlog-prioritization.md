# Playbook: Backlog Prioritization

## Purpose

Produce a prioritized, rationale-backed backlog that the team can execute with confidence.

## When to use

- Sprint or release planning is starting
- The backlog has grown and priority is unclear
- Stakeholders are pushing for more than capacity allows
- A new goal has emerged that changes the priority order

## Inputs needed

```txt
Stated goal for this release or sprint
Team capacity and timeline
Backlog items (named, not vague)
Dependencies between items
Any hard constraints (regulatory, contractual, partner commitments)
```

## Fast-start questions

1. "What is the single most important outcome of this release?"
2. "Which items are blockers for other items?"
3. "What happens if we defer item X? Does the goal still hold?"
4. "Are acceptance criteria defined for all Must have items? If not, that is the first gap."
5. "What is explicitly Won't have? Has that been communicated to stakeholders?"

## Recommended process

1. **State the goal** — Priority is relative to a goal. Without a stated goal, prioritization is arbitrary.
2. **Check acceptance criteria** — Items without acceptance criteria cannot be tested as done. Flag them before assigning priority.
3. **Apply MoSCoW**:
   - Must have: required for the stated goal; release has no value without it
   - Should have: important but deferrable if needed
   - Could have: low-cost addition if capacity exists
   - Won't have: explicitly out of scope for this release
4. **Check dependencies** — Does a Must have item depend on a lower-priority item? Resolve conflicts.
5. **Validate against capacity** — Does the Must have list fit in the available time? If not, something moves.
6. **Surface trade-offs** — State explicitly what is being deferred and why.
7. **Document decisions** — Record in `templates/en/decision-log.md`.

## Framework selection guide

| Situation | Framework |
| --- | --- |
| Many items with unclear ranking | RICE or ICE score |
| Need to communicate scope to stakeholders | MoSCoW |
| Quick visual prioritization | Impact/effort matrix |
| Small team, few items, clear goal | Judgment + explicit rationale |
| Dependencies dominate ordering | Dependency-aware sequencing |

## RICE scoring (when needed)

Score = (Reach × Impact × Confidence) / Effort

Use RICE when comparing items across different goal areas. Do not use it when fewer than 5 items or when scores would be entirely speculative.

## Dependency-aware sequencing

When dependencies constrain order:

1. Map predecessor relationships.
2. Items that unlock other Must haves take priority over their own impact score.
3. Flag circular dependencies — they indicate unclear scope.

## Risk-adjusted priority

Items that are uncertain or novel should move earlier. Discovering a feasibility problem in week 1 is recoverable. Discovering it in week 6 is not.

## When not to score

Do not apply RICE or ICE when:

- Fewer than 5 items and the team already agrees
- Priority is constrained by a hard external requirement
- The scores would be pure speculation

In these cases, state the reasoning plainly: "We are building X first because it is required. Y and Z are deferred because capacity does not allow both in this sprint."

## Quality checklist

- [ ] Goal stated before prioritization starts
- [ ] Each Must have item maps directly to the goal
- [ ] Won't have list is explicit (not implied)
- [ ] Acceptance criteria confirmed for Must have items
- [ ] Dependencies checked — no Must have depends on a Won't have
- [ ] Must have list fits in available capacity
- [ ] Trade-offs communicated to stakeholders

## Common mistakes

- Too many Must haves (everything cannot be critical)
- Must haves that do not connect to the stated goal
- No explicit Won't have list (leads to scope creep)
- Ignoring dependencies when ranking
- Using RICE scores to dress up a decision already made

## Related templates

- `templates/en/decision-log.md`
- `templates/fa/decision-log.md`

## Related scenarios

- `tests/scenarios/software-prioritization.md`
