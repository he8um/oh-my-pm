# Test Scenario: English Project Diagnosis

**Purpose:** Verify that Oh My PM produces a structured English project diagnosis.

## Input

```
Project: Payments API v2 integration
Status: Week 3 of 8. 60% complete.
Blockers: Vendor sandbox credentials delayed. QA environment not ready.
Risk: No rollback plan. Launch date committed to stakeholders.

Diagnose the project and identify immediate actions.
```

## Expected behavior

- Structured response with RAG status
- Top 3 risks in table format
- Critical path clearly stated
- Immediate actions with owners and timeframes
- No filler phrases
- Concise and actionable

## Pass criteria

- [ ] RAG status provided
- [ ] Risks in structured format
- [ ] Critical path identified
- [ ] Actions are specific and owner-assigned
- [ ] Response is under 400 words

## Related example

`examples/software-project/output.en.md`
