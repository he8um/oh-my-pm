# Playbook: Delivery Planning

## Purpose

Create a structured, realistic delivery plan that identifies what needs to happen, in what order, who owns it, and what could stop it.

## When to use

- Starting execution on a new initiative or sprint
- An existing plan is outdated or incomplete
- A milestone is approaching and dependencies are unclear
- Stakeholders are asking for a delivery date

## Inputs needed

```txt
Project brief or PRD (approved)
Team composition and available capacity
Known dependencies (internal and external)
Hard constraints: launch date, compliance deadlines, partner commitments
Top risks from intake or previous diagnosis
```

## Fast-start questions

1. "What must be true at each major milestone before we can proceed?"
2. "What is the critical path — the sequence that determines the earliest we can deliver?"
3. "What external dependencies are we waiting on, and when are they confirmed?"
4. "What team capacity assumptions is this plan based on?"
5. "What is the first thing that could break this plan?"

## Recommended process

1. **Confirm the goal** — What does done look like? What is the measurable success criterion?
2. **Define milestones** — Major checkpoints with binary pass/fail criteria (not task lists).
3. **Map dependencies** — What must happen before what? Internal and external.
4. **Identify the critical path** — The longest sequence with no slack. Protect it.
5. **Assign owners** — One DRI per milestone. Not a team. A person.
6. **Set realistic target dates** — Based on capacity (70-80%, not 100%), not aspirations.
7. **Document top risks** — For each risk: likelihood, impact, mitigation, owner.
8. **Define go/no-go criteria** — What must be true before each major milestone?
9. **Set delivery cadence** — How often will status be reviewed? Who attends?

## Milestone quality rules

A good milestone is:

- Named specifically: "QA complete" not "testing phase"
- Binary: done or not done — not "mostly done"
- Dated: target date, not "soon"
- Owned: one DRI, not a team
- Sequenced: dependencies are explicit

## Critical path identification

1. List all milestones and tasks with estimates.
2. Map predecessor relationships (what depends on what).
3. Calculate the longest path from start to finish.
4. Items on the longest path have zero float — no delay can be absorbed.
5. Protect critical path items first.

## Capacity assumptions

Do not plan at 100% capacity. Buffer for:

- Code reviews and PR turnaround (often 0.5 days per task)
- Holidays and planned leave
- Unexpected production issues
- Ramp-up for new team members
- Review and approval cycles

Use 70-80% as a planning baseline.

## Output structure

```txt
Initiative: [Name]
Goal: [Measurable success criterion]
DRI: [Owner]
Timeline: [Start — End]

Milestones:
| Milestone | Target date | Owner | Dependencies | Go/no-go criteria |

Critical path:
1. [Step] — [Owner] — [Date]
2. ...

Top risks:
| Risk | Likelihood | Impact | Mitigation | Owner |

Dependencies:
| Dependency | Type | Owner | Status | Due |

Open decisions:
| Decision | Owner | Deadline |
```

## Quality checklist

- [ ] Each milestone has exactly one owner
- [ ] Critical path is identified
- [ ] External dependencies are confirmed with the external owner
- [ ] Capacity is based on realistic availability (not theoretical maximum)
- [ ] Top 3 risks have mitigations and owners
- [ ] Go/no-go criteria defined for at least the major milestones

## Common mistakes

- Planning at 100% capacity
- Milestones that are phases rather than binary checkpoints
- No dependency analysis (discovering blockers during execution)
- Aspirational dates instead of committed dates
- Confusing a task list with a delivery plan

## Bilingual note

In Persian: مایلستون (milestone), مسیر بحرانی (critical path), مالک / DRI (owner), وابستگی (dependency), معیار گو/نوگو (go/no-go criteria).

## Related templates

- `templates/en/roadmap.md`
- `templates/fa/roadmap.md`
- `templates/en/risk-register.md`
