# Test Scenario: PRD Review

**Purpose:** Verify that Oh My PM reviews a PRD and flags missing elements.

## Input

```
PRD: In-app notification center
Goal: Reduce support tickets
Team: 2 engineers, 1 designer
Timeline: 5 weeks

[PRD body has no acceptance criteria, no success metric target, and no non-goals listed]

Review this PRD and flag any issues.
```

## Expected behavior

- Missing acceptance criteria flagged
- Missing success metric target flagged
- Missing non-goals flagged
- Concrete suggestions for what to add

## Pass criteria

- [ ] Acceptance criteria gap flagged
- [ ] Success metric gap flagged (no target number)
- [ ] Non-goals gap flagged
- [ ] Suggestions are specific

## Related example

`examples/product-project/output.en.md`
