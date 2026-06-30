# Playbook: Project Intake

## Purpose

Establish shared understanding of a project before planning begins. Intake prevents misaligned assumptions from driving weeks of work in the wrong direction.

## When to use

- A new project or initiative is starting
- You are taking over a project mid-flight and need to establish context
- A stakeholder has requested work and the scope is unclear

## Inputs needed

Before intake is complete, you need answers to:

```txt
What problem are we solving? For whom?
What does success look like — specifically?
What is in scope? What is explicitly not in scope?
Who decides? Who is affected? Who must be consulted?
What is the hard constraint: date, budget, or scope?
What depends on this? What does this depend on?
What do we not know yet?
```

## Fast-start questions

Use these to quickly understand any project:

1. "What is the single most important outcome this project must achieve?"
2. "If we shipped on time but this feature was missing, would the launch still be worth it?"
3. "What is the one thing that could make this fail despite everyone doing their best work?"
4. "Who has already said no to something, and what was it?"
5. "What have we not talked about yet that we probably should?"

## Recommended process

1. **Collect the brief** — Ask for or read the existing project brief, PRD, or request document.
2. **Identify gaps** — Which of the 7 intake signals (below) are missing?
3. **Ask focused questions** — One gap at a time. Do not conduct a 30-question interview.
4. **Document the intake** — Use `templates/en/project-brief.md`.
5. **Confirm non-goals** — Explicitly state what is out of scope. Get agreement.
6. **Surface the first risk** — Name the highest-risk assumption before planning begins.
7. **Define the first milestone** — A concrete, binary deliverable within the first 2 weeks.

## Intake signal checklist

| Signal | Question | Status |
| --- | --- | --- |
| Problem | What user or business problem are we solving? | |
| Goal | What does success look like — measurable? | |
| Scope | What is in scope? What is explicitly out? | |
| Stakeholders | Who decides? Who is affected? Who must be consulted? | |
| Constraints | What are the hard limits: date, budget, team? | |
| Dependencies | What does this depend on? What depends on this? | |
| Unknowns | What do we not yet know that could change the plan? | |

## Output structure

A complete intake produces:

- Problem statement (specific, not vague)
- Measurable success criterion
- Scope and non-goals agreed with stakeholders
- Stakeholder map with decision authority
- Top 3 constraints
- Dependency list with owners
- Top 2-3 unknowns with plan to resolve them
- First milestone with target date and owner

## Decision rules

- If the goal is not measurable, flag it before planning begins.
- If there are no non-goals, add them. Without them, anything adjacent is implicitly in scope.
- If the decision authority is unclear, resolve it before planning. Who says yes?
- If there are unknowns that would change the plan significantly, resolve them before committing to a timeline.

## Risk checks

- Scope: Is the scope wider than the team can deliver in the timeline?
- Stakeholder: Is the executive sponsor aligned with the stated goal?
- Dependency: Does this project depend on something that is not confirmed?
- Assumption: Is the timeline built on an assumption that has not been validated?

## Quality checklist

- [ ] Problem statement is specific: user, context, pain
- [ ] Success criterion is measurable (a number, not a direction)
- [ ] Non-goals are explicit and agreed
- [ ] At least one person is named as DRI (Directly Responsible Individual)
- [ ] Top 3 risks identified
- [ ] First milestone has a date and owner

## Common mistakes

- Accepting "improve user experience" as a goal
- Starting planning before scope is agreed
- Mapping stakeholders without naming who decides
- Treating timeline as a constraint when it is actually a preference
- Not naming non-goals because "everyone already knows"

## Bilingual note

For Persian-language teams: use `templates/fa/project-brief.md`. Problem statement, goals, and constraints in Persian; technical identifiers (API, rollback, QA, sprint, backlog) preserved in English.

## Related templates

- `templates/en/project-brief.md`
- `templates/fa/project-brief.md`
- `templates/en/risk-register.md`
