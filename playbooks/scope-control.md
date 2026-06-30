# Playbook: Scope Control

## Purpose

Prevent uncontrolled scope expansion from eroding delivery quality, timeline, and team capacity.

## When to use

- A stakeholder requests something new after scope was agreed
- The team is quietly adding work without formal approval
- Milestones are slipping and the reason is not capacity — it is scope
- Non-goals are being challenged or ignored
- Change requests arrive during execution

## Inputs needed

```txt
Original scope document (project brief, PRD, or agreed milestone list)
List of items added since scope was agreed
Timeline and capacity baseline
Decision log
```

## Fast-start questions

1. "What was agreed at kickoff? Where is it documented?"
2. "What has been added since then — and who approved it?"
3. "If we add this, what comes out or what slips?"
4. "Does this addition change the goal, or just the solution?"
5. "Who has authority to approve a scope change?"

## Recommended process

1. **Document original scope** — If it is not written down, write it now.
2. **List all additions** — Name each item explicitly. Do not lump them together.
3. **Assess impact per item** — Timeline, team, risk, quality.
4. **Categorize each addition**:
   - Must have now: blocks the stated goal; cannot defer
   - Should have now: improves the outcome; assess cost
   - Defer: real value but not for this release
   - Remove: not aligned with the goal
5. **Present the trade-off** — If scope grows, timeline or resources must adjust. Name the trade-off explicitly.
6. **Record the decision** — In `templates/en/decision-log.md`. Every scope change needs a decision record.
7. **Brief stakeholders** — Who needs to know about the change and its impact?

## Impact analysis format

```txt
Scope change: [Name of addition]
Requested by: [Stakeholder]
Impact on timeline: [Days / weeks added]
Impact on team: [Who is affected, how much capacity]
Impact on risk: [What risk increases]
Trade-off: Accept change and [adjust timeline / adjust scope elsewhere] OR defer
Decision: [Accept / Defer / Remove]
Owner of decision: [Name]
```

## Signs of scope creep

- Requirements growing without timeline or resource adjustment
- "While we're at it..." requests from stakeholders
- Features added after sprint planning without formal approval
- PRD updated after sign-off without a change control step
- Non-goals being challenged or treated as aspirational rather than firm

## Decision rules

- Every scope change needs an explicit decision with an owner.
- If scope grows, something else must adjust: timeline, resources, or other scope items.
- Non-goals are not suggestions. They are commitments. Challenging a non-goal requires a formal change.
- If a scope addition is blocking delivery of an agreed Must have, it is not "additional scope" — it is a defect in the plan.

## Escalation

Escalate to the executive sponsor when:

- A scope addition would change the launch date by more than one week
- A stakeholder is bypassing the change process
- The team is absorbing scope changes without adjustment and quality is at risk

## Quality checklist

- [ ] Original scope is documented and agreed
- [ ] Each addition is named and assessed individually
- [ ] Every scope change has a decision record with owner
- [ ] Trade-off is made explicit to stakeholders
- [ ] Non-goals are restated if a change request conflicts with them

## Common mistakes

- Absorbing scope changes silently ("we'll just fit it in")
- Agreeing to scope additions without adjusting the plan
- Treating non-goals as negotiable without a formal change
- Not documenting scope decisions (causes disputes later)
- Escalating without presenting options

## Related templates

- `templates/en/decision-log.md`
- `templates/fa/decision-log.md`
- `templates/en/project-brief.md`
