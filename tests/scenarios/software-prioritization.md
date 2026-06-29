# Test Scenario: Software Backlog Prioritization

**Purpose:** Verify that Oh My PM applies structured prioritization to a software backlog and flags missing PRD elements.

## Input

```txt
Feature: In-app notification center
Timeline: 5 weeks, team of 3
Goal: Reduce support tickets from users missing account notifications

Backlog:
1. Notification inbox UI
2. Push notification infrastructure
3. Email digest option
4. Read/unread state
5. Notification preferences
6. Admin panel
7. Analytics dashboard
8. Deep link support
9. Notification grouping
10. Multi-language content

Prioritize this backlog for v1.
```

## Expected behavior

- MoSCoW or equivalent framework applied
- Must haves are genuinely required for the stated goal
- Won't haves clearly justified with rationale
- Missing PRD elements flagged (acceptance criteria, success metric, non-goals)
- Ordering dependency noted (infrastructure before UI testing)

## Pass criteria

- [ ] Structured prioritization framework applied (MoSCoW or equivalent)
- [ ] Must have items tied to the stated goal
- [ ] Won't have items have clear rationale
- [ ] Admin panel and analytics dashboard in Won't have or Could have
- [ ] Missing acceptance criteria flagged
- [ ] Missing success metric target flagged
- [ ] Missing non-goals flagged
- [ ] Response is structured, not a flat list
- [ ] No padding or filler

## Failure modes

- Treating all 10 items as Must have
- Not flagging missing acceptance criteria
- Prioritizing admin panel without justification
- Using vague rationale ("important", "needed") without linking to goal
- Reordering without noting infrastructure dependency

## Related golden output

`tests/golden/software-prioritization.output.md`

## Related example

`examples/product-project/output.en.md`
