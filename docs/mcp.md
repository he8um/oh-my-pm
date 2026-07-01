# MCP Integration

MCP (Model Context Protocol) support is planned as a **future optional integration layer** for Oh My PM.

MCP is **not implemented** in this version. Planning and interface design are documented here. Implementation begins at v0.7.0.

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

## What MCP will do

- Provide read-only access to PM tool data: issues, tasks, milestones, members, project state
- Allow agents to inspect the current state of a project from connected tools
- Surface information that improves diagnosis, planning, risk review, and stakeholder updates
- Follow the same PM-focused, token-efficient output principles as the rest of Oh My PM

---

## What MCP will not do

- Replace `AGENTS.md`, `CLAUDE.md`, Cursor rules, Skill files, or any existing packs
- Become a generic integration platform
- Perform write actions in v0.7.0 alpha (read-only only)
- Perform write actions in any version without explicit user confirmation and per-connector safety controls
- Collect telemetry or send data without user action
- Connect to systems outside the configured connector list
- Scan repositories broadly without a specific user request
- Store credentials in the repository

---

## Read-only-first policy

The v0.7.0 MCP server will be read-only. No connector will support write actions in the alpha.

Write actions (creating tasks, updating statuses, commenting on issues) require:

1. Per-connector explicit user confirmation
2. Per-action confirmation at the MCP tool call layer
3. Connector-specific safety controls reviewed before release
4. A written policy in `docs/mcp-security-policy.md` for the specific action

Write actions will not be added until these conditions are met.

---

## Planned stack

```txt
Runtime:         Node.js
Language:        TypeScript
Package manager: pnpm
Future path:     packages/mcp-server/
```

The MCP server will live in `packages/mcp-server/` when implemented. This directory does not exist in v0.6.0.

---

## Planned tool categories

MCP tools are the callable functions the agent uses to fetch data. All tool names are English.

Planned tool categories:

| Category | Example tools |
| --- | --- |
| Project inspection | `inspect_project_context`, `summarize_delivery_status` |
| Risk and blockers | `list_open_risks`, `list_blockers` |
| Issue and task data | `list_open_issues`, `get_milestone_status` |
| Stakeholder context | `list_team_members`, `summarize_stakeholder_updates` |
| Agent workflow | `prepare_agent_handoff`, `diagnose_project` |

These are design-phase names. Final names will be defined in `docs/mcp-interface-design.md` before v0.7.0 implementation.

---

## Planned resources

MCP resources are read-only data objects exposed to the agent:

- `project://current` — current project context (name, status, milestone state)
- `risks://open` — current open risk register
- `issues://open` — open issues from a connected connector
- `team://members` — team member list from a connected connector

---

## Planned prompts

MCP prompts are pre-built prompt templates exposed to the client:

- `diagnose-project` — run a full project diagnosis using connected data
- `create-delivery-plan` — structured delivery plan from connected milestone data
- `prepare-stakeholder-update` — generate a stakeholder update from live data

---

## Connector roadmap

One connector per version after the MCP alpha. Connector sequencing is based on team coverage and integration complexity.

| Version | Connector | Primary use case |
| --- | --- | --- |
| v0.7.0 | MCP server alpha — no external connector required | Local repo context inspection |
| v0.8.0 | GitHub Issues / Projects | Issue tracking, milestone state |
| v0.9.0 | ClickUp | Task management, sprint data |
| v0.10.0 | Airtable | Lightweight project tracking |
| v0.11.0 | Linear | Engineering-focused issue tracking |
| v0.12.0 | Jira | Enterprise project management |
| v0.13.0 | Notion | Docs-as-PM hybrid workflows |

See `docs/mcp-connector-roadmap.md` for connector-level detail.

---

## Security principles

- No credentials in the repository
- Environment variables only for runtime auth
- Read-only by default
- Write actions require explicit confirmation — not enabled in v0.7.0
- No telemetry
- No background network calls without a user-initiated tool call
- No broad repository scans by default
- Connector allowlist — only configured connectors are accessible
- Failure-safe: agent continues without MCP data if the server is unavailable

See `docs/mcp-security-policy.md` for the full security policy.

---

## Bilingual behavior

MCP tool names and resource identifiers are English. Agent output language follows the user/project language setting — Persian or English.

A Persian-language project using MCP will receive Persian-language delivery outputs backed by English-named tool calls. Technical identifiers (API, rollback, sprint, backlog) remain in English in all outputs.

---

## Token-efficient behavior

MCP tool responses will be structured for agent consumption, not human reading. Raw data returned by MCP tools will be summarized and formatted by the agent before presenting to the user.

Agents will not dump raw connector data into responses. They will extract what is relevant to the delivery question and present it in the standard Oh My PM structured format.

---

## Non-goals

- MCP is not a generic automation platform
- MCP will not manage every possible project tool
- MCP will not replace manual context for teams that do not use connected tools
- MCP will not enable agents to take actions without user knowledge
- MCP will not introduce write capability before safety controls are defined and reviewed
- No dashboard before stable MCP and v1.0.0

---

## v0.6.0 scope

Phase 6 is documentation-only:

- `docs/mcp.md` — this file — deepened and finalized
- `docs/mcp-interface-design.md` — future MCP interface design
- `docs/mcp-security-policy.md` — security policy for future MCP
- `docs/mcp-connector-roadmap.md` — connector sequencing and design
- `docs/architecture.md` — MCP layer added to architecture diagram
- `docs/security-model.md` — MCP-specific security section added

No implementation. No `packages/mcp-server/`. No connector code.

---

## v0.7.0 scope

Phase 7 will implement the MCP server alpha:

- `packages/mcp-server/` — TypeScript/Node.js MCP server
- Read-only tool implementations
- Local repo context inspection (no external connector required)
- MCP client compatibility verified with Claude Code
- No write actions
- No external connector required for the alpha

---

## Open questions

All open questions from Phase 6 have been resolved in `docs/mcp-alpha-scope.md`.

Summary of decisions:

1. **MCP client version targeting:** Protocol version `2024-11-05` (stable base, supported by `@modelcontextprotocol/sdk` and Claude Code).
2. **Auth model:** No authentication in v0.7.0 local-only alpha. stdio transport runs as a client subprocess — no network exposure.
3. **Project root discovery:** `OH_MY_PM_PROJECT_ROOT` environment variable; falls back to `process.cwd()`. Single root per instance.
4. **Stale/unavailable data:** Tools return `status: "partial"` with a `warnings` array for missing files; `status: "error"` when project root is unreadable.
5. **Connector error degradation:** Structured `status: "error"` response; agent continues without data. (v0.7.0 has no external connectors.)

See `docs/mcp-alpha-scope.md` for full resolution details.

---

## Related docs

- `docs/mcp-interface-design.md`
- `docs/mcp-security-policy.md`
- `docs/mcp-connector-roadmap.md`
- `docs/architecture.md`
- `docs/security-model.md`
- `ROADMAP.md`
