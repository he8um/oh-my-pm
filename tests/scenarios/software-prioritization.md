# Test Scenario: Software Backlog Prioritization

**Purpose:** Verify that Oh My PM applies structured prioritization to a software backlog.

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
- Won't haves are clearly justified
- Missing PRD elements flagged (acceptance criteria, success metric)

## Pass criteria

- [ ] Structured prioritization framework applied
- [ ] Must have items justify the goal
- [ ] Won't have items have clear rationale
- [ ] Missing PRD elements flagged

## Related example

`examples/product-project/output.en.md`
