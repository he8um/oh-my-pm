# Reference: Delivery Management

## Purpose

Guide the agent to manage delivery planning, execution oversight, cadence, escalation, blockers, and agent handoffs across any project type.

## When to use this reference

- User asks for a delivery plan, milestone list, or execution roadmap
- User shares a project in flight and asks what to do next
- User asks about blockers, escalation, or status
- User asks for a handoff prompt for the next agent session

## Core operating principles

- Delivery is about moving work to done, not planning it.
- The critical path determines the earliest completion date — protect it first.
- Blockers are not just risk. They are active stops. Escalate them immediately.
- Cadence prevents drift. A weekly delivery rhythm keeps the team aligned.
- Handoffs must be self-contained. The next agent should not need this context.

## Delivery plan structure

A delivery plan answers: what, who, by when, in what order, and what blocks it.

```txt
Initiative: [Name]
Goal: [What success looks like]
Timeline: [Start — End]
Owner: [DRI]

Milestones:
| Milestone | Target date | Owner | Dependencies | Status |

Critical path:
1. [Step] — [Owner] — [Date]
2. ...

Top risks:
| Risk | Likelihood | Impact | Mitigation | Owner |

Dependencies:
| Dependency | Type (internal/external) | Owner | Status |

Open decisions:
| Decision | Owner | Deadline |

Go/no-go criteria:
- [What must be true before each major milestone]
```

## Critical path

The critical path is the sequence of work that determines the earliest possible completion.

To find it:

1. List all milestones and their dependencies.
2. Identify which sequence has zero float — no slack.
3. Protect those steps first.

If two blockers exist, escalate the one on the critical path first.

## RAG status rules

| Status | Meaning | Action |
| --- | --- | --- |
| 🟢 Green | On track; no critical open risks | Maintain cadence; monitor |
| 🟡 Amber | At risk but recoverable; active blocker or open risk | Escalate blocker; present mitigation |
| 🔴 Red | Timeline or scope at serious risk; unresolved | Escalate to executive sponsor; present options |

Move from Green to Amber when: a blocker appears, a milestone slips, or a key decision is missed.

Move from Amber to Red when: the critical path is broken and recovery requires scope or timeline negotiation.

## Weekly delivery rhythm

A consistent cadence prevents accumulation of hidden drift:

- **Monday**: review blockers; confirm milestone owners know their next action
- **Mid-week**: spot-check critical path items; surface any new risks
- **End of week**: status report; update risk register; confirm next week's milestones

Do not wait for a formal meeting to escalate a blocker.

## Blocker management

A blocker is an active stop — work cannot proceed.

When a blocker appears:

1. Name it specifically: what is blocked, what is needed, who can unblock.
2. Assign an owner and a deadline for resolution.
3. Assess whether it is on the critical path — if so, escalate immediately.
4. Track in the status report.

Blocker format:

```txt
Blocker: [What is stopped]
Needs: [What is required to unblock]
Owner: [Who is responsible for unblocking]
Escalation needed: [Yes / No]
By: [When it must be resolved]
```

## Dependency tracking

| Dependency | Type | Blocks | Owner | Status | Due |
| --- | --- | --- | --- | --- | --- |
| [Name] | Internal / External | [Milestone] | [Name] | Open / In progress / Done | [Date] |

External dependencies (vendor, regulatory, another team) need earlier escalation than internal ones.

## Capacity awareness

When planning, factor in:

- Team size and available capacity (not full velocity)
- Holidays, releases, and parallel work
- Ramp-up time for new team members
- Review and approval cycles (these are work too)

A plan that assumes 100% capacity will slip. Use 70-80% as a realistic planning baseline.

## Escalation rules

Escalate when:

- A blocker has been open more than one working day with no movement
- A milestone will slip and it is on the critical path
- A risk has materialized into an issue
- A decision is blocking two or more people and no one is deciding
- Scope has expanded without approval

Escalation is not failure. Delayed escalation is.

## Handoff prompt quality

When generating an agent handoff prompt:

1. State project status in 3-5 bullet points.
2. State what is decided (do not re-litigate).
3. State what is open and needs resolution.
4. State one specific next action with owner and deadline.
5. Include any constraints the next agent must not ignore.
6. Keep it under 300 words.
7. Use bullet points, not paragraphs.
8. Preserve English technical identifiers.

The handoff must be self-contained. The next agent will not have this conversation.

## Delivery status output structure

```txt
Project: [Name]
Date: [Date]
Status: 🟢/🟡/🔴

Summary: [2-3 sentences — lead with the key message]

What changed this period:
- [Change 1]
- [Change 2]

Blockers:
- [Blocker — owner — escalation: yes/no]

Decisions needed:
| Decision | Owner | Due |

Risks:
| Risk | Status |

Next milestones:
| Milestone | Target | Status |
```

## Common mistakes to avoid

- Planning every detail before confirming the critical path
- Treating all blockers equally — only critical path blockers are urgent
- Handoffs that repeat context instead of synthesizing it
- Status reports that say everything is fine when it is Amber
- Waiting for a meeting to escalate an active blocker

## Bilingual note

In Persian: مسیر بحرانی (critical path), بلاکر (blocker), اسکالیشن (escalation), هندآف (handoff), وضعیت (status). Keep all technical identifiers in English even in Persian delivery context.
