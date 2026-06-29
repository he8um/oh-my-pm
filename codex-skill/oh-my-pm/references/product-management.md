# Reference: Product Management

## Purpose

Guide the agent to apply structured product management: problem framing, PRD review, backlog prioritization, MVP definition, success metrics, roadmap trade-offs, and decision quality.

## When to use this reference

- User asks to review a PRD or requirements document
- User shares a backlog and asks for prioritization
- User asks to define MVP scope or non-goals
- User asks for success metrics, roadmap trade-offs, or product decisions

## Core operating principles

- Start with the problem, not the solution. A PRD without a clear problem statement is speculative.
- Non-goals are as important as goals. Explicit scope boundaries prevent scope creep.
- Success metrics must be measurable before work starts, not defined after.
- Prioritization is a trade-off decision, not a ranking exercise.
- Feedback loops close the loop. Build measurement and learning into the plan.

## PRD review checklist

A complete PRD includes:

- [ ] Problem statement: specific user or business problem — not vague
- [ ] Goals: measurable, not just directional
- [ ] Non-goals: what is explicitly out of scope for this release
- [ ] User stories or use cases
- [ ] Functional requirements: numbered, specific
- [ ] Non-functional requirements: performance, security (RBAC), availability (SLA)
- [ ] Acceptance criteria: testable, not vague
- [ ] Dependencies: external and internal, with owners and status
- [ ] Risks: at least the top 3, with mitigation
- [ ] Success metrics: baseline, target, measurement method
- [ ] Open questions: what must be decided before planning is complete
- [ ] Approvals: PM, engineering lead, design — signed off

When any of these are missing, flag them as blocking open items.

## Problem statement quality check

A good problem statement answers:

- Who has the problem? (specific user or customer segment)
- What is the problem? (observable behavior or outcome)
- Why does it matter? (business or user impact)
- How do we know it is real? (data, support tickets, user research)

Vague: "Users are not engaging with notifications."

Specific: "Users who receive account security alerts are not taking action — support tickets from missed 2FA prompts increased 40% in Q3."

## MVP definition

MVP is the minimum that delivers real value to a real user. It is not:

- The smallest possible version we can ship
- A prototype
- A feature with all the important parts stripped out

To define MVP:

1. State the core user need being addressed.
2. List all proposed features.
3. For each feature, ask: does the user get value without this?
4. Anything the user does not need for core value = not MVP.
5. State non-goals explicitly.

## Success metrics

| Metric | Type | Baseline | Target | Measurement method |
| --- | --- | --- | --- | --- |
| [Metric name] | Leading / Lagging | [Current value] | [Goal] | [How measured] |

Good metrics are:

- Specific (support ticket reduction, not "improved experience")
- Measurable before work starts
- Tied to the problem statement
- Time-bound (target by when)

Vanity metrics (page views, app opens without action) do not indicate product success.

## Roadmap trade-offs

When the roadmap has more work than capacity:

1. Rank by: user impact, strategic alignment, delivery risk, and dependency order.
2. Present options, not a single answer: what happens if we defer X?
3. Surface dependencies: what does each item unlock or block?
4. Make the trade-off visible to stakeholders. Do not hide it in a sorted list.

Common trade-off language:

- "If we defer X, we gain 2 weeks of engineering capacity but delay the Y metric improvement by one quarter."
- "X is a dependency for Z. Deferring X means Z cannot start until next quarter."

## Feedback loops

Build feedback mechanisms into the product plan:

| Signal | Source | Owner | Frequency |
| --- | --- | --- | --- |
| User behavior | Analytics | PM | Weekly |
| Support tickets | Support | PM | Weekly |
| NPS / CSAT | Surveys | PMM | Monthly |
| Feature adoption | Product analytics | PM | After each release |

Schedule a post-launch review. Define what you will learn and by when.

## Common mistakes to avoid

- Reviewing a PRD without checking for measurable success metrics
- Prioritizing without stating constraints (team, time, dependencies)
- Defining MVP as "everything we planned minus the hard parts"
- Approving requirements without explicit acceptance criteria
- Writing goals that cannot be measured ("improve user experience")

## Bilingual note

In Persian: PRD (not translated), MVP (not translated), معیار پذیرش (acceptance criteria), اسکوپ (scope), خارج از اسکوپ (non-goals), بک‌لاگ (backlog). Preserve English for metric names and tool names.
