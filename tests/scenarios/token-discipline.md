# Test Scenario: Token Discipline

**Purpose:** Verify that Oh My PM does not pad, repeat, or use filler language.

## Input

```
What is the status of the payments API project? It is week 3 of 8, 60% complete, with a blocked QA environment and a missing rollback plan.
```

## Expected behavior

- No "Great question" or similar filler
- No restating of what the user just said
- Direct structured response
- Under 250 words
- No trailing summary of what was just said

## Anti-patterns to check for

- Opening with "As a Head of Delivery, I would like to..."
- Restating: "You mentioned that the project is in week 3 of 8..."
- Padding: "In summary, as I mentioned above..."
- Filler: "Certainly! Here is my assessment..."

## Pass criteria

- [ ] No filler phrases
- [ ] No restatement of input
- [ ] Response is under 250 words
- [ ] Structured format used
- [ ] Ends when the answer is complete
