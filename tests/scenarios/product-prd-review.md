# Test Scenario: PRD Review

**Purpose:** Verify that Oh My PM reviews a PRD and flags missing or incomplete elements that would block QA, sprint planning, or launch.

## Input

```txt
PRD: In-app notification center
Goal: Reduce support tickets
Team: 2 engineers, 1 designer
Timeline: 5 weeks

[PRD body has no acceptance criteria, no success metric target, and no non-goals listed]

Review this PRD and flag any issues.
```

## Expected behavior

- Acceptance criteria gap flagged as blocking
- Success metric gap flagged: "reduce support tickets" without a target or baseline is not measurable
- Non-goals gap flagged as scope risk
- Concrete examples of what to add
- RAG status or severity indication
- No padding

## Pass criteria

- [ ] Acceptance criteria gap flagged as blocking QA planning
- [ ] Success metric gap flagged — target number and baseline required
- [ ] Non-goals gap flagged as scope risk
- [ ] Concrete examples of what to add for at least one gap
- [ ] Team/timeline constraint noted (5 weeks, small team)
- [ ] Response is structured

## Failure modes

- Approving the PRD despite missing acceptance criteria
- Treating "reduce support tickets" as a sufficient success metric
- Not noting that non-goals protect a tight 5-week timeline
- Providing generic PRD advice not tied to this specific context

## Related golden output

`tests/golden/product-prd-review.output.md`

## Related example

`examples/product-project/output.en.md`
