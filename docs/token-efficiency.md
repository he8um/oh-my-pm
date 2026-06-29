# Token Efficiency

Oh My PM is designed for token-efficient AI agent workflows.

## Why token discipline matters

- Padded outputs slow down review and decision-making.
- Repeating context wastes context window budget.
- Generic phrases add no value to delivery work.

## Rules applied by Oh My PM agents

- Do not repeat context already established in the conversation.
- Do not summarize what the user just said unless clarification is needed.
- Use concise phrasing. Prefer specific over generic.
- Use structured formats (lists, tables, headings) instead of long prose.
- Lead with the key message. Support with detail below.
- Avoid filler: "Great question", "Certainly", "As a Head of Delivery...".
- Avoid restating the task before answering it.
- Stop when the answer is complete.

## For agent handoffs

When generating an agent handoff prompt:

- Summarize context in bullet points, not paragraphs.
- State what is decided and what is open.
- State the next action explicitly.
- Do not include information the next agent does not need.

## Related docs

- `docs/usage.md`
- `prompts/en/create-next-agent-prompt.md`
