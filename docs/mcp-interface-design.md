# MCP Interface Design

This document defines the future interface design for the Oh My PM MCP server.

This is a planning document. No implementation exists in v0.6.0. Implementation begins at v0.7.0.

---

## Design principles

1. **PM-focused only.** Every tool, resource, and prompt serves a delivery leadership use case. Not a generic data platform.
2. **Read-only first.** All v0.7.0 tools are read-only. Write actions require a separate policy review per connector.
3. **Token-efficient.** Tool responses return structured summaries, not raw data dumps. Agents extract the relevant signal.
4. **Bilingual-compatible.** Tool names and identifiers are English. Output language follows the user/project language setting.
5. **Failure-safe.** Agent continues without MCP data if the server is unavailable or a connector returns an error.
6. **Minimal surface.** Expose only what is needed for delivery work. Do not expose every field from every connector.
7. **Explicit over implicit.** Tools return structured data the agent interprets. The agent does not take write actions implicitly.

---

## Server identity

```txt
Server name:    oh-my-pm
Version:        will match package version
Protocol:       MCP (Model Context Protocol)
Transport:      stdio (local) for v0.7.0 alpha
Authentication: none for local-only v0.7.0; future versions TBD
```

---

## Tool naming conventions

- Tool names are English
- Snake_case format: `verb_noun` or `verb_object_noun`
- Lead with a delivery-relevant verb: `inspect_`, `list_`, `summarize_`, `get_`, `diagnose_`, `prepare_`
- Avoid generic names: `get_data`, `fetch_all`, `query`
- Names should be self-documenting to an agent reading the tool list

### Verb vocabulary

| Verb | When to use |
| --- | --- |
| `inspect_` | High-level context read (project, team, status) |
| `list_` | Returns a list of items (issues, risks, members) |
| `summarize_` | Returns a structured summary (delivery status, updates) |
| `get_` | Returns a specific item by ID or name |
| `diagnose_` | Runs a structured delivery diagnosis |
| `prepare_` | Generates a structured output for agent use (handoff, update) |

---

## Planned tools

All tools are read-only. No write actions in v0.7.0.

### Core tools (v0.7.0 alpha — no external connector required)

| Tool name | Description | Returns |
| --- | --- | --- |
| `inspect_project_context` | Read current project context from local repo (README, AGENTS.md, VERSION) | Project name, version, status |
| `diagnose_project` | Run a structured project diagnosis using available context | RAG status, top risks, blockers, critical path |
| `prepare_agent_handoff` | Generate a self-contained handoff prompt from current context | Structured handoff prompt |
| `summarize_delivery_status` | Summarize delivery status from available context | Status, milestone list, open decisions |

### Issue and task tools (connector-dependent, v0.8.0+)

| Tool name | Description | Connector |
| --- | --- | --- |
| `list_open_issues` | List open issues with title, assignee, label, and priority | GitHub, Linear, Jira |
| `get_milestone_status` | Get status of a named milestone or sprint | GitHub, Linear, Jira |
| `list_open_blockers` | List items labeled or tagged as blockers | GitHub, Linear, Jira, ClickUp |
| `list_open_tasks` | List open tasks assigned to the team | ClickUp, Airtable, Notion |
| `get_task_details` | Get details for a specific task by ID | ClickUp, Linear, Jira |

### Risk and decision tools (connector-dependent, v0.8.0+)

| Tool name | Description | Connector |
| --- | --- | --- |
| `list_open_risks` | List items tagged as risks in the connected tool | GitHub, ClickUp, Linear |
| `summarize_stakeholder_updates` | Summarize recent stakeholder-relevant activity | GitHub, Jira, Linear |

### Implemented connector tool names

The tables above describe the planned generic tool vocabulary. Shipped
connectors use a `<connector>_<verb>_<noun>` naming convention instead, to
keep each connector's tools unambiguous when multiple connectors are
configured at once:

- GitHub (v0.8.0): `github_list_issues`, `github_summarize_issue`,
  `github_list_milestones`, `github_get_repository_context`
- ClickUp (v0.9.0): `clickup_list_tasks`, `clickup_summarize_task`,
  `clickup_summarize_list_status`, `clickup_list_spaces`,
  `clickup_list_folders`, `clickup_list_lists`,
  `clickup_get_workspace_context`

See `docs/github-connector.md` and `docs/clickup-connector.md` for the
authoritative tool list per connector.

---

## Resource naming conventions

- Resources use URI format: `scheme://path`
- Scheme is lowercase and descriptive: `project://`, `risks://`, `issues://`, `team://`
- Path is lowercase with hyphens for multi-word segments
- Resources are read-only

### Planned resources

| Resource URI | Description |
| --- | --- |
| `project://current` | Current project context (name, version, status, milestone state) |
| `project://risks/open` | Current open risk register |
| `project://decisions/open` | Open decisions with owners and deadlines |
| `issues://open` | Open issues from the connected connector |
| `issues://blockers` | Open items tagged as blockers |
| `team://members` | Team member list from the connected connector |

---

## Prompt naming conventions

- Prompt names are kebab-case English
- Prompts provide structured starting points for common delivery tasks
- Prompts are pre-filled with context from connected resources where available

### Planned prompts

| Prompt name | Description |
| --- | --- |
| `diagnose-project` | Full project diagnosis using connected data |
| `create-delivery-plan` | Structured delivery plan from milestone and issue data |
| `prepare-stakeholder-update` | Stakeholder update from live project status |
| `review-open-risks` | Risk review using connected risk data |
| `prepare-agent-handoff` | Handoff prompt from current context |

---

## Input/output shape principles

### Tool inputs

- Accept only what is needed to complete the task
- All parameters are typed and documented
- No credentials as parameters — credentials are provided via environment variables at server startup
- Optional parameters have safe defaults
- No parameters that could trigger write actions in v0.7.0

### Tool outputs

- Return structured data objects, not prose
- Include only fields the agent can use for delivery work
- Never include raw credential data, internal system IDs beyond what is needed, or personally identifiable information beyond what is needed for delivery work
- Include an `error` field when data is unavailable — agent should continue gracefully
- Response size is bounded: list responses return a maximum of 50 items by default

### Example tool output shape

```json
{
  "status": "ok",
  "project": {
    "name": "Payments API v2",
    "version": "v0.5.0",
    "rag_status": "amber",
    "rag_rationale": "QA window compressed by vendor credential delay"
  },
  "open_issues": 12,
  "blockers": [
    {
      "id": "issue-42",
      "title": "Sandbox credentials not delivered",
      "assignee": "engineering-lead",
      "days_open": 3
    }
  ]
}
```

---

## Error handling principles

- Tool errors must not expose credentials, internal paths, or system details
- Return a structured error object with a safe message and an error code
- Agent treats a tool error as a signal to continue without that data, not to abort
- Server startup errors are logged to stderr — not surfaced to the agent

### Error response shape

```json
{
  "status": "error",
  "error_code": "connector_unavailable",
  "message": "GitHub connector returned a non-200 response. Continuing without issue data."
}
```

---

## Read-only-first policy

v0.7.0: All tools are read-only. No mutations.

Future write action requirements (before any write tool is added):

1. Written policy in `docs/mcp-security-policy.md` for the specific action
2. Explicit user confirmation at the MCP tool call layer
3. Per-connector safety review completed
4. Rollback or undo path defined
5. Action is scoped to the minimum necessary change

Write actions will not ship before all five conditions are met for that action.

---

## Bilingual response behavior

- Tool names and resource identifiers are always English
- The MCP server does not translate tool output
- The Oh My PM agent layer translates structured tool data into the user/project language
- Persian-language projects receive Persian-language delivery summaries backed by English-named tools
- Technical identifiers preserved in English in all outputs: API, rollback, sprint, backlog, QA, CI/CD

---

## Token-efficient response behavior

- Tool responses are structured data, not prose
- The agent extracts the relevant signal and presents it in structured Oh My PM format
- Agents do not dump raw MCP tool responses into user-facing outputs
- Response size is bounded (max 50 items per list response)
- Large datasets are summarized, not fully enumerated

---

## Local repository context boundaries

In v0.7.0, the MCP server reads from the local repository only:

- `AGENTS.md`, `CLAUDE.md`, `VERSION`, `README.md` for project identity
- `CHANGELOG.md` for recent changes
- `ROADMAP.md` for milestone state
- Files explicitly requested by the agent within the project root

The server does not scan the entire repository by default. Broad scans require an explicit tool call with a stated scope.

The server does not read files outside the project root.

---

## Related docs

- `docs/mcp.md`
- `docs/mcp-security-policy.md`
- `docs/mcp-connector-roadmap.md`
- `docs/architecture.md`
