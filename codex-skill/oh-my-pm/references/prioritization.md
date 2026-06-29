# Reference: Prioritization

## Purpose

Guide the agent to apply structured prioritization to backlogs, roadmaps, and resource decisions — including when to use a framework and when simpler judgment is better.

## When to use this reference

- User asks to prioritize a backlog, feature list, or initiative set
- User asks which framework to use for prioritization
- User asks about trade-offs between competing items
- User asks to resolve a priority conflict between stakeholders

## Core operating principles

- Prioritization is a trade-off, not a ranking. Always state what gets deferred and why.
- Frameworks are tools, not answers. Use the simplest tool that resolves the decision.
- Dependencies constrain order. A higher-priority item cannot come first if it depends on a lower-priority one.
- Re-prioritize when context changes. A frozen backlog is not a managed backlog.
- Surface conflicts early. Hidden priority disagreements emerge as scope creep.

## When to use which framework

| Situation | Framework |
| --- | --- |
| Many items with unclear ranking | RICE or ICE |
| Need to communicate scope boundaries to stakeholders | MoSCoW |
| Quick visual prioritization across two dimensions | Impact/Effort matrix |
| Small team, clear goals, few items | Judgment + explicit reasoning |
| Dependency-constrained work | Dependency-aware sequencing |
| Risk or uncertainty is the main variable | Risk-adjusted priority |

Do not use RICE scoring when there are fewer than 5 items or when the team already agrees on the top priorities.

## RICE

Score = (Reach × Impact × Confidence) / Effort

| Factor | What it measures | Scale |
| --- | --- | --- |
| Reach | Users or events affected in a period | Number |
| Impact | How much it moves the key metric per user | 3 = massive / 2 = high / 1 = medium / 0.5 = low / 0.25 = minimal |
| Confidence | How certain are the estimates? | 100% = high / 80% = medium / 50% = low |
| Effort | Person-months of work | Number |

Higher score = higher priority.

RICE is most useful when comparing items across different teams or goal areas. It breaks down when Reach and Impact estimates are speculative — in that case, ICE is simpler.

## ICE

Score = Impact × Confidence × Ease

Simpler than RICE. Use it for quick directional prioritization when Reach data is not available.

| Factor | What it measures | Scale (1-10) |
| --- | --- | --- |
| Impact | Effect on key metric | 10 = highest |
| Confidence | How sure are we this will work? | 10 = certain |
| Ease | How easy is it to implement? | 10 = trivial |

Higher score = higher priority.

## MoSCoW

- **Must have**: non-negotiable for this release. Without it, the release has no value.
- **Should have**: important but not blocking release. Can be deferred if needed.
- **Could have**: nice to have. Small value, low cost.
- **Won't have**: explicitly out of scope for this release. Do not leave this implicit.

Use MoSCoW when you need to communicate scope to stakeholders — especially when stakeholders are pushing for more than capacity allows.

Always make the Won't Have list explicit. A missing Won't Have list creates false expectations.

## Impact/Effort matrix

```txt
                 Low effort    High effort
High impact   |  Do first   |  Plan carefully  |
Low impact    |  Do if easy |  Deprioritize    |
```

Use this for a quick team conversation about where to focus. It does not replace rigorous scoring for high-stakes decisions.

## Dependency-aware sequencing

When items have dependencies:

1. Map dependencies explicitly: what does item X require before it can start?
2. Identify the critical path through the dependency chain.
3. Items that unlock others should move up in priority, even if their own impact is moderate.
4. Flag circular dependencies — they indicate unclear scope.

## Risk-adjusted priority

For items with uncertainty:

- Higher risk items should be tackled earlier to maximize learning time.
- A high-impact item with a 30% confidence estimate may be lower priority than a medium-impact item at 90% confidence.
- Factor in: what happens if this item fails? Can we recover?

## Priority conflict resolution

When stakeholders disagree on priority:

1. Make the conflict explicit: state the two competing items and what each stakeholder wants.
2. State the constraint: what is the capacity limit? What must be deferred?
3. Present the trade-off: what does each option cost in timeline, risk, or impact?
4. Escalate to the DRI if the conflict cannot be resolved at the team level.

Do not resolve priority conflicts by promising to do both. State the real trade-off.

## When not to over-score

Do not use RICE or ICE when:

- There are fewer than 5 items and the team agrees on the top one or two.
- The priority is determined by a hard external constraint (regulatory, contractual).
- The scores would be entirely speculative and the team knows it.

In these cases, state the reasoning plainly: "We are doing X first because it is required by the contract. Y and Z are deferred until Q3."

## Common mistakes to avoid

- Using RICE scoring to dress up a decision that was already made
- Leaving Won't Have implicit in MoSCoW
- Treating a prioritized list as permanent
- Ignoring dependencies when ranking
- Resolving stakeholder conflict by saying "we'll do both" without adjusting scope or timeline

## Bilingual note

In Persian: اولویت‌بندی (prioritization), اولویت (priority), اسکوپ (scope), بک‌لاگ (backlog). MoSCoW, RICE, ICE remain in English. Must/Should/Could/Won't can be translated as باید/باید داشته باشیم/می‌توانیم/نخواهیم داشت.
