# Reference: Token Efficiency

## Purpose

Guide the agent to produce outputs that are token-efficient without sacrificing clarity, completeness, or quality — and to work efficiently in AI agent contexts.

## When to use this reference

- Producing any output: apply these rules by default
- User asks for a summary, handoff, or compressed context
- User asks to review or shorten an existing output
- Working in a long conversation where context is accumulating

## Core operating principles

- Do not repeat context already established in the conversation.
- Do not summarize what the user just said unless clarification is needed.
- Lead with the key message. Support with detail below.
- Use structured formats (tables, lists, headings) instead of long prose.
- Stop when the answer is complete. Do not add a summary after a structured output.
- Avoid filler: "Great question", "Certainly", "As requested", "I will now...".

## Minimal context collection

Before reading files or exploring context:

1. Identify what specific information is needed to answer the question.
2. Read only the files or sections that contain that information.
3. Do not scan every file looking for something relevant.
4. If context is ambiguous, ask one focused clarifying question instead of assuming.

Do not re-read files already in context. Do not read directories to understand structure when the user has already described the structure.

## Focused file reading

When reading files or code:

- Read the relevant section, not the whole file.
- If a file is large, identify the section by name or line range before reading.
- Do not read documentation files to understand a codebase — read the code or config.
- Do not read files to confirm information the user has already stated.

## Summary-first workflow

When producing multi-section output:

1. Lead with the key message or diagnosis in 1-3 sentences.
2. Follow with structured detail (tables, lists).
3. End when the content is complete — do not add a closing summary.

The reader should be able to stop reading when they have enough information.

## Compact output formats

Prefer:

- Tables over repeated prose for comparative information
- Bullet lists over numbered lists when order does not matter
- Numbered lists when order matters or steps must be followed in sequence
- Short status lines (🟡 Amber — QA blocked on DevOps) over full paragraphs

Avoid:

- Repeating the same information in different formats within the same output
- Writing "as you can see in the table above..." (they can already see it)
- Using headers for sections with only one bullet

## When to ask clarifying questions

Ask when:

- The task requires information the user has not provided and cannot be assumed
- Two reasonable interpretations would produce materially different outputs
- Proceeding on a wrong assumption would waste significant effort

Do not ask when:

- The answer can be inferred from context with reasonable confidence
- The question is about style preference, not content requirements
- The user has already stated enough to proceed

When you must ask, ask one question at a time. Not a list of five questions.

## Agent handoff compression

When generating a handoff prompt for the next agent session:

1. State current project status in 3-5 bullet points — not paragraphs.
2. State what is decided. The next agent should not re-litigate closed decisions.
3. State what is open and needs resolution.
4. State the next concrete action: what, who, by when.
5. Include any hard constraints the next agent must not ignore.
6. Keep the total under 300 words.

The handoff is a compressed state transfer, not a narrative. Write it like a brief, not a story.

## Output length calibration

| Output type | Target length |
| --- | --- |
| Status update (executive) | 150-300 words |
| Project diagnosis | 300-500 words with tables |
| Delivery plan | 400-700 words with tables |
| Risk register | Table only — no prose per row needed |
| Handoff prompt | Under 300 words |
| PRD review | 300-600 words with checklist |
| Prioritization output | Table or list — no prose per item needed |

These are targets, not hard limits. A complex situation may need more. A simple question needs less. Calibrate to the actual complexity of the task.

## Common mistakes to avoid

- Reading context to confirm what the user already said
- Repeating the question before answering it
- Adding a summary after a complete structured output
- Using filler phrases that add length without adding meaning
- Asking multiple clarifying questions when one would suffice
- Producing a 500-word answer to a question that needs 50 words

## Related references

- `references/delivery-management.md` — handoff prompt structure
- `references/stakeholder-communication.md` — concise status update structure
