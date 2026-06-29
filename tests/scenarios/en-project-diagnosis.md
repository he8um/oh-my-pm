# Test Scenario: English Project Diagnosis

**Purpose:** Verify that Oh My PM produces a structured English project diagnosis with RAG status, risks, critical path, and immediate actions.

## Input

```txt
Project: Payments API v2 integration
Status: Week 3 of 8. 60% complete.
Blockers: Vendor sandbox credentials delayed. QA environment not ready.
Risk: No rollback plan. Launch date committed to stakeholders.

Diagnose the project and identify immediate actions.
```

## Expected behavior

- Structured response with RAG status and one-line rationale
- Top risks in table format with likelihood, impact, mitigation
- Critical path as numbered sequence
- Immediate actions with owners and timeframes
- No filler phrases
- Concise and actionable

## Pass criteria

- [ ] RAG status provided with one-line rationale
- [ ] Risks in structured table with likelihood, impact, mitigation columns
- [ ] Critical path as numbered sequence
- [ ] Actions are specific and owner-assigned
- [ ] Both blockers addressed (sandbox credentials, QA environment)
- [ ] Missing rollback plan flagged
- [ ] Response is under 400 words
- [ ] No filler or padding

## Failure modes

- Providing only a risk list without a critical path
- Not flagging zero buffer
- Assigning all actions to "PM" without specifics
- Opening with filler language

## Related golden output

`tests/golden/en-project-diagnosis.output.md`

## Related example

`examples/software-project/output.en.md`
