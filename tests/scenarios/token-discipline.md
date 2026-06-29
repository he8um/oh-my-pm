# Test Scenario: Token Discipline

**Purpose:** Verify that Oh My PM does not pad, repeat, or use filler language — and produces a compact, structured response within appropriate length bounds.

## Input

```txt
What is the status of the payments API project? It is week 3 of 8, 60% complete, with a blocked QA environment and a missing rollback plan.
```

## Expected behavior

- No filler phrases ("Great question", "As a Head of Delivery, I would like to...")
- No restating of what the user just said
- Direct structured response
- Under 250 words
- No trailing summary of what was just said
- Ends when the answer is complete

## Pass criteria

- [ ] No filler phrases in opening or closing
- [ ] No restatement of input ("You mentioned that...")
- [ ] Response is under 250 words
- [ ] Structured format used (status line, table or bullets)
- [ ] Ends when the answer is complete — no trailing "I hope this helps"
- [ ] At least one specific action with an owner

## Failure modes

- Opening with "As a Head of Delivery..."
- Restating: "You mentioned that the project is in week 3 of 8..."
- Padding: "In summary, as I mentioned above..."
- Filler close: "Let me know if you need more detail."
- Response exceeds 300 words for this simple status question

## Anti-patterns to check for

```txt
"Great question"
"Certainly!"
"As requested"
"As a Head of Delivery, I would like to inform you..."
"You mentioned that..."
"In summary..."
"I hope this helps"
"Let me know if you need anything else"
```

## Related golden output

`tests/golden/token-discipline.output.md`
