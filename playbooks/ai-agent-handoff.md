# Playbook: AI Agent Handoff

## Purpose

Create a self-contained, token-efficient handoff prompt that enables the next AI agent session to continue work without access to the current conversation history.

## When to use

- The current session is approaching its context limit
- You are switching from one AI tool to another
- You want to start a focused sub-session for a specific task
- A human needs to resume the conversation in a fresh context

## Inputs needed

```txt
Current project state (what happened, what is decided, what is open)
Files touched or created
Risks or constraints the next agent must not ignore
The next exact task
What the next agent should NOT do
```

## Core principle

The next agent has zero memory of this conversation. Write the handoff as if briefing a competent colleague who just walked into the room. They need context — not history.

## Recommended structure

```txt
## Context

[3-5 bullet points: what project, what phase, current status]

## What is decided — do not re-litigate

- [Decision 1]
- [Decision 2]

## What is open — needs resolution

- [Open question 1 — who owns it]
- [Open question 2 — what is blocking it]

## Files touched

- [File path] — [What changed or why it is relevant]

## Constraints the next agent must not ignore

- [Constraint 1]
- [Constraint 2]

## Next exact task

[One specific, actionable task: what to do, in what order, with what output expected]

## Do not

- [Specific anti-action 1]
- [Specific anti-action 2]
```

## Token efficiency rules

- Under 300 words total.
- Do not summarize the entire conversation — synthesize only what matters.
- Do not repeat context already visible in the files.
- Do not re-litigate closed decisions.
- State the next action precisely. "Continue the work" is not an action.
- Use bullets, not paragraphs.

## Quality checklist

- [ ] Self-contained: the next agent does not need to read this conversation
- [ ] Current state in 3-5 bullets (not a narrative)
- [ ] Decided items listed (closed — do not revisit)
- [ ] Open items listed with owners
- [ ] Files touched are named (not "I edited some files")
- [ ] Constraints are explicit
- [ ] Next task is specific and actionable
- [ ] Do-not list prevents the next agent from making known mistakes
- [ ] Under 300 words

## Common mistakes

- Including the full conversation history (the next agent cannot process it usefully)
- Vague next actions: "continue the project", "finish the work"
- Not listing constraints (next agent violates them unknowingly)
- Not separating decided from open (next agent re-litigates closed decisions)
- Over-long handoffs that the next agent cannot effectively use

## Technical identifier preservation

In Persian-language handoffs, preserve English technical identifiers in the handoff prompt — even if the surrounding language is Persian. The next agent needs the exact identifiers to locate files, APIs, and systems.

## Related prompts

- `prompts/en/create-next-agent-prompt.md`
- `prompts/fa/create-next-agent-prompt.md`
