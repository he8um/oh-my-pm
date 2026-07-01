# MCP Integration

MCP (Model Context Protocol) support is an **optional integration layer** for Oh My PM.

MCP shipped as a read-only alpha starting at v0.7.0. As of v0.13.0, the MCP
server includes six read-only external connectors (GitHub, ClickUp,
Airtable, Linear, Jira, Notion) in addition to local repository context
tools. This document originally described the pre-implementation plan; the
sections below now describe what shipped, with the original planning intent
preserved where it still applies. See `docs/mcp-alpha-scope.md` for the
resolved implementation decisions and `packages/mcp-server/README.md` for
the current tool/resource/prompt list.

---

## What MCP means for Oh My PM

MCP gives Oh My PM agents optional, structured access to live project data from PM tools.

Without MCP, Oh My PM operates entirely on context you provide — project briefs, status updates, backlog contents, and anything pasted into the conversation. This is sufficient for most delivery work.

With MCP, agents can fetch current data directly: open issues, sprint status, recent activity, milestone state. This reduces manual context assembly and improves output accuracy when live data matters.

MCP is a data-access layer. It does not change agent behavior, role, or judgment. `AGENTS.md` remains the sole source of truth for all behavioral policy.

---

## Why MCP is optional

Skill-only usage (Claude Code, Cursor, Codex, ChatGPT, generic AGENTS.md) works today. MCP improves it but is not required.

Teams that provide context manually still benefit fully from the delivery layer. MCP reduces friction for teams who want live data access without manual copying.

---

## What MCP does

- Provides read-only access to PM tool data: issues, tasks, milestones, members, project state
- Lets agents inspect the current state of a project from connected tools
- Surfaces information that improves diagnosis, planning, risk review, and stakeholder updates
- Follows the same PM-focused, token-efficient output principles as the rest of Oh My PM

---

## What MCP does not do

- Replace `AGENTS.md`, `CLAUDE.md`, Cursor rules, Skill files, or any existing packs
- Act as a generic integration platform
- Perform any write action, in any shipped connector or version (read-only only)
- Collect telemetry or send data without user action
- Connect to systems outside the configured connector list
- Scan repositories broadly without a specific user request
- Store credentials in the repository

---

## Read-only-first policy

The MCP server is read-only. No shipped connector supports write actions.

Write actions (creating tasks, updating statuses, commenting on issues) would require:

1. Per-connector explicit user confirmation
2. Per-action confirmation at the MCP tool call layer
3. Connector-specific safety controls reviewed before release
4. A written policy in `docs/mcp-security-policy.md` for the specific action

No write action has been added, and none will be until these conditions are met.

---

## Stack

```txt
Runtime:         Node.js
Language:        TypeScript
Package manager: pnpm
Path:            packages/mcp-server/
```

---

## Implemented tool naming

MCP tools are the callable functions the agent uses to fetch data. All tool names are English.

Local context tools use a `verb_noun` pattern (e.g. `inspect_project_context`,
`summarize_delivery_status`). Connector tools use a
`<connector>_<verb>_<noun>` pattern (e.g. `github_list_issues`,
`clickup_summarize_list_status`, `jira_list_boards`) so that tools remain
unambiguous when multiple connectors are configured at once.

See `docs/mcp-interface-design.md` for the naming convention and
`packages/mcp-server/README.md` for the authoritative, current tool list
across local context and all six connectors.

---

## Resources

MCP resources are read-only data objects exposed to the agent, using a
`scheme://path` URI per connector (`project://`, `github://`, `clickup://`,
`airtable://`, `linear://`, `jira://`, `notion://`).

See `packages/mcp-server/README.md` for the authoritative, current resource
list.

---

## Prompts

MCP prompts are pre-built prompt templates exposed to the client, one set
per local-context and connector surface (e.g. `diagnose-project`,
`summarize-jira-delivery-status`, `diagnose-notion-knowledge-base`).

See `packages/mcp-server/README.md` for the authoritative, current prompt
list.

---

## Connector roadmap

One connector per version, shipped in this order:

| Version | Connector | Primary use case |
| --- | --- | --- |
| v0.7.0 | MCP server alpha — no external connector required | Local repo context inspection |
| v0.8.0 | GitHub Issues / Projects | Issue tracking, milestone state |
| v0.9.0 | ClickUp | Task management, sprint data |
| v0.10.0 | Airtable | Lightweight project tracking |
| v0.11.0 | Linear | Engineering-focused issue tracking |
| v0.12.0 | Jira | Enterprise project management |
| v0.13.0 | Notion | Docs-as-PM hybrid workflows |

As of v0.13.0, this completes the currently planned connector list. See
`docs/mcp-connector-roadmap.md` for connector-level detail and current
status.

---

## Security principles

- No credentials in the repository
- Environment variables only for runtime auth
- Read-only by default
- No connector supports write actions
- No telemetry
- No background network calls without a user-initiated tool call
- No broad repository scans by default
- Connector allowlist — only configured connectors are accessible
- Failure-safe: agent continues without MCP data if the server is unavailable

See `docs/mcp-security-policy.md` for the full security policy.

---

## Bilingual behavior

MCP tool names and resource identifiers are English. Agent output language follows the user/project language setting — Persian or English.

A Persian-language project using MCP receives Persian-language delivery outputs backed by English-named tool calls. Technical identifiers (API, rollback, sprint, backlog) remain in English in all outputs.

---

## Token-efficient behavior

MCP tool responses are structured for agent consumption, not human reading. Raw data returned by MCP tools is summarized and formatted by the agent before presenting to the user.

Agents do not dump raw connector data into responses. They extract what is relevant to the delivery question and present it in the standard Oh My PM structured format.

---

## Non-goals

- MCP is not a generic automation platform
- MCP does not manage every possible project tool
- MCP does not replace manual context for teams that do not use connected tools
- MCP does not enable agents to take actions without user knowledge
- MCP will not introduce write capability before safety controls are defined and reviewed
- No dashboard before stable MCP and v1.0.0

---

## Implementation history

- **v0.6.0** — Documentation-only phase: interface design, security policy, connector roadmap, and architecture docs written before any implementation.
- **v0.7.0** — MCP server alpha shipped: `packages/mcp-server/`, read-only local-context tools, no external connector required.
- **v0.8.0 – v0.13.0** — One read-only external connector shipped per version: GitHub, ClickUp, Airtable, Linear, Jira, Notion.

See `docs/mcp-alpha-scope.md` for the resolved v0.7.0 implementation decisions, including MCP protocol version targeting, the local-only auth model, project root discovery (`OH_MY_PM_PROJECT_ROOT`), and the stale/unavailable-data response shape (`status: "partial"` with a `warnings` array; `status: "error"` when project root is unreadable).

---

## Related docs

- `docs/mcp-interface-design.md`
- `docs/mcp-security-policy.md`
- `docs/mcp-connector-roadmap.md`
- `docs/architecture.md`
- `docs/security-model.md`
- `ROADMAP.md`
