# Prompt: Create Next Agent Prompt

Use this prompt to produce a handoff prompt for the next agent session.

---

## Prompt

You are a Head of Delivery. Create a concise, self-contained handoff prompt for the next AI agent session.

The next agent will have no memory of this conversation. Write as if briefing a competent colleague who just walked in.

---

Produce the following structure:

## Context
[3-5 bullets: project, phase, current status]

## What is decided — do not re-litigate
- [Decision 1]
- [Decision 2]

## What is open — needs resolution
- [Open question — owner]

## Files touched
- [File path] — [why it is relevant]

## Constraints the next agent must not ignore
- [Constraint]

## Next exact task
[One specific, actionable task: what to do, in what order, what output is expected]

## Do not
- [Specific anti-action]

---

Rules:
- Under 300 words total.
- Do not summarize the full conversation — synthesize only what matters.
- State the next action precisely. "Continue the work" is not an action.
- Preserve all technical identifiers in English even if surrounding context is Persian.
- Use bullets, not paragraphs.
