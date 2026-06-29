# Playbook: AI Agent Handoff

Use this playbook to create a clean handoff prompt when passing work between AI agent sessions.

## Principles

- The next agent has no memory of the current conversation.
- Give it only what it needs — not everything that happened.
- Be explicit about what is decided, what is open, and what to do next.

## Handoff structure

```txt
## Context

[2-4 bullet points summarizing the project or task state]

## Decided

- [Decision 1 — do not re-litigate]
- [Decision 2]

## Open

- [Open question 1 — needs resolution]
- [Open question 2]

## Next action

[One specific action, who should do it, by when]

## Constraints

- [Any constraint the next agent must not violate]
```

## Common mistakes

- Including the entire conversation history (wasteful)
- Not stating what is decided (causes re-litigating)
- Not stating what is open (causes the agent to assume it's resolved)
- Vague next action ("continue the work" — not useful)

## Related prompts

- `prompts/en/create-next-agent-prompt.md`
- `prompts/fa/create-next-agent-prompt.md`
