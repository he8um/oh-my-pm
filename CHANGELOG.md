# Changelog

All notable changes to Oh My PM are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [VERSIONING.md](VERSIONING.md).

---

## [Unreleased] — v0.13.0

### Added in v0.13.0

- `docs/notion-connector.md`: new — Notion connector scope, read-only policy, tools, resources, prompts, configuration, failure behavior, rate-limit behavior, pagination/limit behavior, delivery semantics, test approach, explicit write-action exclusions, and an explicit note on Notion's read-only-via-POST search/query endpoints
- `packages/mcp-server/src/connectors/notion/`: Notion connector — config.ts, errors.ts, types.ts, limits.ts, formatters.ts, client.ts, pages.ts, databases.ts, blocks.ts, search.ts
- `packages/mcp-server/src/tools/notion-search-pages.ts`: search the workspace for pages/databases accessible to the integration, bounded to 25 items by default
- `packages/mcp-server/src/tools/notion-summarize-page.ts`: structured summary of a single page by ID
- `packages/mcp-server/src/tools/notion-query-database.ts`: list database items with data-quality tags (missing owner, missing status, missing due date, stale), optional status filter
- `packages/mcp-server/src/tools/notion-summarize-database.ts`: database delivery status summary — item count, data-quality issues, handoff gaps, recommended next actions
- `packages/mcp-server/src/tools/notion-get-page-context.ts`: page properties plus first-level block children as plain-text content, bounded
- `packages/mcp-server/src/resources/registry.ts`: added `notion://workspace/current`, `notion://pages/current`, `notion://database/current` resources (bounded)
- `packages/mcp-server/src/prompts/registry.ts`: added `summarize-notion-delivery-status`, `diagnose-notion-knowledge-base`, `prepare-notion-project-handoff` prompts
- `packages/mcp-server/tests/notion-config.test.ts`: 5 config loading tests (defaults, optional page/database IDs, custom base URL)
- `packages/mcp-server/tests/notion-read-only-policy.test.ts`: 5 read-only policy tests (Notion tool allowlist, write-style rejections, client exposes only GET and the two documented read-only POST paths, connector source never calls a write endpoint)
- `packages/mcp-server/tests/notion-formatting.test.ts`: 13 formatting tests (data-quality tag extraction, text truncation, item clamping)
- `packages/mcp-server/tests/notion-tools.test.ts`: 14 integration tests (mocked Notion API responses, missing-token degraded response, config errors, token redaction)
- `packages/mcp-server/src/policy/read-only.ts`: expanded — Notion tool allowlist added, `NOTION_READ_ONLY_TOOLS` exported

### Changed in v0.13.0

- `packages/mcp-server/src/server.ts`: registered 5 Notion connector tools — `notion_search_pages`, `notion_summarize_page`, `notion_query_database`, `notion_summarize_database`, `notion_get_page_context`
- `packages/mcp-server/src/server.ts`: version bumped to `0.13.0`
- `packages/mcp-server/package.json`: version bumped to `0.13.0`
- `validate-agent-files.sh`: expanded with Phase 13 Notion connector checks
- `ROADMAP.md`: v0.13.0 marked as in progress; v1.0.0 stabilization noted as next since this completes the currently planned connector list
- `docs/mcp-connector-roadmap.md`: Notion marked as in progress — Phase 13
- `docs/mcp-security-policy.md`: Notion added to the connector allowlist and least-privilege guidance
- `docs/mcp-interface-design.md`: documented implemented Notion connector tool names
- `docs/compatibility.md`, `docs/supported-tools.md`: Notion connector marked shipped; supported-tools notes the connector list is now complete
- `packages/mcp-server/README.md`: added Notion connector tool, resource, prompt, and configuration documentation

---

## [v0.12.0] — 2026-07-01

### Added in v0.12.0

- `docs/jira-connector.md`: new — Jira connector scope, read-only policy, tools, resources, prompts, configuration, failure behavior, rate-limit behavior, pagination/limit behavior, delivery semantics, test approach, explicit write-action exclusions
- `packages/mcp-server/src/connectors/jira/`: Jira connector — config.ts, errors.ts, types.ts, limits.ts, formatters.ts, client.ts, issues.ts, projects.ts, boards.ts
- `packages/mcp-server/src/tools/jira-list-issues.ts`: list open issues in the configured project with delivery tags (blocked, stale, unassigned, missing estimate, missing sprint, overdue), bounded to 25 items by default
- `packages/mcp-server/src/tools/jira-summarize-issue.ts`: structured summary of a single issue by key
- `packages/mcp-server/src/tools/jira-summarize-project-status.ts`: project delivery status summary — issue counts, blockers, active sprint completion rate, handoff gaps, recommended next actions
- `packages/mcp-server/src/tools/jira-list-projects.ts`: list projects accessible to the configured site
- `packages/mcp-server/src/tools/jira-list-boards.ts`: list boards in the configured project
- `packages/mcp-server/src/resources/registry.ts`: added `jira://site/current`, `jira://projects`, `jira://issues/open` resources (bounded)
- `packages/mcp-server/src/prompts/registry.ts`: added `summarize-jira-delivery-status`, `diagnose-jira-issue-backlog`, `prepare-jira-project-handoff` prompts
- `packages/mcp-server/tests/jira-config.test.ts`: 5 config loading tests (missing base URL, missing project key, defaults, optional board ID)
- `packages/mcp-server/tests/jira-read-only-policy.test.ts`: 4 read-only policy tests (Jira tool allowlist, write-style rejections, client issues only GET requests)
- `packages/mcp-server/tests/jira-formatting.test.ts`: 18 formatting tests (rate limit headers, status category classification, delivery tag extraction, description truncation, item clamping)
- `packages/mcp-server/tests/jira-tools.test.ts`: 15 integration tests (mocked Jira REST responses, config errors, missing-token degraded response, auth errors, active sprint completion rate, token/email redaction)
- `packages/mcp-server/src/policy/read-only.ts`: expanded — Jira tool allowlist added, `JIRA_READ_ONLY_TOOLS` exported

### Changed in v0.12.0

- `packages/mcp-server/src/server.ts`: registered 5 Jira connector tools — `jira_list_issues`, `jira_summarize_issue`, `jira_summarize_project_status`, `jira_list_projects`, `jira_list_boards`
- `packages/mcp-server/src/server.ts`: version bumped to `0.12.0`
- `packages/mcp-server/package.json`: version bumped to `0.12.0`
- `validate-agent-files.sh`: expanded with Phase 12 Jira connector checks
- `ROADMAP.md`: v0.12.0 marked as in progress, v0.13.0 marked as next
- `docs/mcp-connector-roadmap.md`: Jira marked as in progress — Phase 12
- `docs/mcp-security-policy.md`: Jira added to the connector allowlist and least-privilege guidance
- `docs/mcp-interface-design.md`: documented implemented Jira connector tool names
- `docs/compatibility.md`, `docs/supported-tools.md`: Jira connector marked shipped
- `packages/mcp-server/README.md`: added Jira connector tool, resource, prompt, and configuration documentation

---

## [v0.11.0] — 2026-07-01

### Added in v0.11.0

- `docs/linear-connector.md`: new — Linear connector scope, read-only policy, tools, resources, prompts, configuration, failure behavior, rate-limit behavior, pagination/limit behavior, delivery semantics, test approach, explicit write-action exclusions
- `packages/mcp-server/src/connectors/linear/`: Linear connector — config.ts, errors.ts, types.ts, limits.ts, formatters.ts, client.ts, issues.ts, teams.ts, projects.ts
- `packages/mcp-server/src/tools/linear-list-issues.ts`: list open issues in the configured team with delivery tags (blocked, stale, unassigned, missing estimate, missing cycle), bounded to 25 items by default
- `packages/mcp-server/src/tools/linear-summarize-issue.ts`: structured summary of a single issue by identifier
- `packages/mcp-server/src/tools/linear-summarize-project-status.ts`: team delivery status summary — issue counts, blockers, unassigned, missing estimates, missing cycles, handoff gaps, recommended next actions
- `packages/mcp-server/src/tools/linear-list-teams.ts`: list teams accessible to the configured token
- `packages/mcp-server/src/tools/linear-list-projects.ts`: list projects in the configured team
- `packages/mcp-server/src/resources/registry.ts`: added `linear://workspace/current`, `linear://teams`, `linear://issues/open` resources (bounded)
- `packages/mcp-server/src/prompts/registry.ts`: added `summarize-linear-delivery-status`, `diagnose-linear-issue-backlog`, `prepare-linear-project-handoff` prompts
- `packages/mcp-server/tests/linear-config.test.ts`: 6 config loading tests (missing team ID, defaults, custom base URL, optional workspace/project IDs)
- `packages/mcp-server/tests/linear-read-only-policy.test.ts`: 4 read-only policy tests (Linear tool allowlist, write-style rejections, no GraphQL query contains "mutation")
- `packages/mcp-server/tests/linear-formatting.test.ts`: 16 formatting tests (rate limit headers, state type classification, delivery tag extraction, description truncation, item clamping)
- `packages/mcp-server/tests/linear-tools.test.ts`: 13 integration tests (mocked Linear GraphQL responses, config errors, missing-token degraded response, auth errors, token redaction)
- `packages/mcp-server/src/policy/read-only.ts`: expanded — Linear tool allowlist added, `LINEAR_READ_ONLY_TOOLS` exported

### Changed in v0.11.0

- `packages/mcp-server/src/server.ts`: registered 5 Linear connector tools — `linear_list_issues`, `linear_summarize_issue`, `linear_summarize_project_status`, `linear_list_teams`, `linear_list_projects`
- `packages/mcp-server/src/server.ts`: version bumped to `0.11.0`
- `packages/mcp-server/package.json`: version bumped to `0.11.0`
- `validate-agent-files.sh`: expanded with Phase 11 Linear connector checks
- `ROADMAP.md`: v0.11.0 marked as in progress, v0.12.0 marked as next
- `docs/mcp-connector-roadmap.md`: Linear marked as in progress — Phase 11
- `docs/mcp-security-policy.md`: Linear added to the connector allowlist and least-privilege guidance
- `docs/mcp-interface-design.md`: documented implemented Linear connector tool names
- `docs/compatibility.md`, `docs/supported-tools.md`: Linear connector marked shipped
- `packages/mcp-server/README.md`: added Linear connector tool, resource, prompt, and configuration documentation

---

## [v0.10.0] — 2026-07-01

### Added in v0.10.0

- `docs/airtable-connector.md`: new — Airtable connector scope, read-only policy, tools, resources, prompts, configuration, failure behavior, rate-limit behavior, pagination/limit behavior, delivery semantics, test approach, explicit write-action exclusions
- `packages/mcp-server/src/connectors/airtable/`: Airtable connector — config.ts, errors.ts, types.ts, limits.ts, formatters.ts, client.ts, bases.ts, tables.ts, records.ts
- `packages/mcp-server/src/tools/airtable-list-bases.ts`: list bases accessible to the configured token
- `packages/mcp-server/src/tools/airtable-list-tables.ts`: list tables in the configured base, with field counts
- `packages/mcp-server/src/tools/airtable-describe-table.ts`: describe a table's schema — field names, types, views
- `packages/mcp-server/src/tools/airtable-list-records.ts`: list records with data-quality tags (missing owner, missing due date, missing required field, stale), bounded to 25 items by default
- `packages/mcp-server/src/tools/airtable-summarize-base-status.ts`: table delivery status summary — record count, data-quality issues, handoff gaps, recommended next actions
- `packages/mcp-server/src/resources/registry.ts`: added `airtable://base/current`, `airtable://tables`, `airtable://records/current` resources (bounded)
- `packages/mcp-server/src/prompts/registry.ts`: added `summarize-airtable-base-status`, `diagnose-airtable-data-quality`, `prepare-airtable-project-handoff` prompts
- `packages/mcp-server/tests/airtable-config.test.ts`: 6 config loading tests (missing base ID, defaults, custom base URL, optional table ID/name)
- `packages/mcp-server/tests/airtable-read-only-policy.test.ts`: 3 read-only policy tests (Airtable tool allowlist, write-style rejections)
- `packages/mcp-server/tests/airtable-formatting.test.ts`: 14 formatting tests (data-quality tag extraction, field value truncation, item clamping)
- `packages/mcp-server/tests/airtable-tools.test.ts`: 15 integration tests (mocked Airtable API responses, config errors, missing-token degraded response, auth/rate-limit errors, token redaction)
- `packages/mcp-server/src/policy/read-only.ts`: expanded — Airtable tool allowlist added, `AIRTABLE_READ_ONLY_TOOLS` exported

### Changed in v0.10.0

- `packages/mcp-server/src/server.ts`: registered 5 Airtable connector tools — `airtable_list_bases`, `airtable_list_tables`, `airtable_describe_table`, `airtable_list_records`, `airtable_summarize_base_status`
- `packages/mcp-server/src/server.ts`: version bumped to `0.10.0`
- `packages/mcp-server/package.json`: version bumped to `0.10.0`
- `validate-agent-files.sh`: expanded with Phase 10 Airtable connector checks
- `ROADMAP.md`: v0.10.0 marked as in progress, v0.11.0 marked as next
- `docs/mcp-connector-roadmap.md`: Airtable marked as in progress — Phase 10
- `docs/mcp-security-policy.md`: Airtable added to the connector allowlist and least-privilege guidance
- `docs/mcp-interface-design.md`: documented implemented Airtable connector tool names
- `docs/compatibility.md`, `docs/supported-tools.md`: Airtable connector marked shipped
- `packages/mcp-server/README.md`: added Airtable connector tool, resource, prompt, and configuration documentation

---

## [v0.9.0] — 2026-07-01

### Added in v0.9.0

- `docs/clickup-connector.md`: new — ClickUp connector scope, read-only policy, tools, resources, prompts, configuration, failure behavior, rate-limit behavior, pagination/limit behavior, delivery semantics, test approach, explicit write-action exclusions
- `packages/mcp-server/src/connectors/clickup/`: ClickUp connector — config.ts, errors.ts, types.ts, limits.ts, formatters.ts, client.ts, tasks.ts, hierarchy.ts
- `packages/mcp-server/src/tools/clickup-list-tasks.ts`: list open tasks in a list with delivery tags (blocked, stale, unassigned, missing due date, overdue), bounded to 25 items by default
- `packages/mcp-server/src/tools/clickup-summarize-task.ts`: structured summary of a single task by ID
- `packages/mcp-server/src/tools/clickup-summarize-list-status.ts`: list delivery status summary — blockers, stale, unassigned, missing due dates, overdue, handoff gaps, recommended next actions
- `packages/mcp-server/src/tools/clickup-list-spaces.ts`: list spaces in the configured workspace
- `packages/mcp-server/src/tools/clickup-list-folders.ts`: list folders in a configured or specified space
- `packages/mcp-server/src/tools/clickup-list-lists.ts`: list lists in a configured or specified folder or space (with folderless-list fallback)
- `packages/mcp-server/src/tools/clickup-get-workspace-context.ts`: workspace identity — name, ID, space count
- `packages/mcp-server/src/resources/registry.ts`: added `clickup://workspace/current`, `clickup://spaces`, `clickup://tasks/open` resources (bounded)
- `packages/mcp-server/src/prompts/registry.ts`: added `summarize-clickup-delivery-status`, `diagnose-clickup-task-backlog`, `prepare-clickup-project-handoff` prompts
- `packages/mcp-server/tests/clickup-config.test.ts`: 6 config loading tests (missing workspace ID, defaults, custom base URL, optional IDs)
- `packages/mcp-server/tests/clickup-read-only-policy.test.ts`: 3 read-only policy tests (ClickUp tool allowlist, write-style rejections)
- `packages/mcp-server/tests/clickup-formatting.test.ts`: 17 formatting tests (rate limit headers, status classification, delivery tag extraction, description truncation, item clamping)
- `packages/mcp-server/tests/clickup-tools.test.ts`: 22 integration tests (mocked ClickUp API responses, config errors, missing-token degraded response, auth errors, token redaction)
- `packages/mcp-server/src/policy/read-only.ts`: expanded — ClickUp tool allowlist added, `CLICKUP_READ_ONLY_TOOLS` exported

### Changed in v0.9.0

- `packages/mcp-server/src/server.ts`: registered 7 ClickUp connector tools — `clickup_list_tasks`, `clickup_summarize_task`, `clickup_summarize_list_status`, `clickup_list_spaces`, `clickup_list_folders`, `clickup_list_lists`, `clickup_get_workspace_context`
- `packages/mcp-server/src/server.ts`: version bumped to `0.9.0`
- `packages/mcp-server/package.json`: version bumped to `0.9.0`
- `validate-agent-files.sh`: expanded with Phase 9 ClickUp connector checks
- `ROADMAP.md`: v0.9.0 marked as released, v0.10.0 marked as next
- `docs/mcp-connector-roadmap.md`: ClickUp marked as released — Phase 9
- `docs/mcp-security-policy.md`: ClickUp added to the connector allowlist and least-privilege guidance
- `docs/mcp-interface-design.md`: documented implemented connector tool naming convention
- `docs/compatibility.md`, `docs/supported-tools.md`: ClickUp connector marked shipped
- `packages/mcp-server/README.md`: added ClickUp connector tool, resource, prompt, and configuration documentation

---

## [v0.8.0] — 2026-07-01

### Added in v0.8.0

- `docs/github-connector.md`: new — GitHub Issues / Projects connector scope, read-only policy, tools, resources, configuration, failure behavior, rate-limit behavior, test approach, explicit write-action exclusions
- `packages/mcp-server/src/connectors/github/`: GitHub connector — config.ts, errors.ts, types.ts, limits.ts, formatters.ts, client.ts, issues.ts, milestones.ts, repository.ts
- `packages/mcp-server/src/tools/github-list-issues.ts`: list open GitHub issues with delivery tags (blocker, stale), label filter, bounded to 25 items by default
- `packages/mcp-server/src/tools/github-summarize-issue.ts`: structured summary of a single issue by number
- `packages/mcp-server/src/tools/github-list-milestones.ts`: open milestones with due date, completion percentage, overdue flag
- `packages/mcp-server/src/tools/github-get-repository-context.ts`: repository name, description, default branch, open issue count
- `packages/mcp-server/tests/github-config.test.ts`: 6 config loading tests (missing fields, defaults, GitHub Enterprise URL)
- `packages/mcp-server/tests/github-read-only-policy.test.ts`: 3 read-only policy tests (GitHub tool allowlist, write-style rejections)
- `packages/mcp-server/tests/github-formatting.test.ts`: 9 formatting tests (rate limit headers, delivery tags, body truncation, item clamping)
- `packages/mcp-server/tests/github-tools.test.ts`: 10 integration tests (mocked GitHub API responses, config errors, auth errors, token redaction)
- `packages/mcp-server/src/policy/read-only.ts`: expanded — GitHub tool allowlist added, `GITHUB_READ_ONLY_TOOLS` exported

### Changed in v0.8.0

- `packages/mcp-server/src/server.ts`: registered 4 GitHub connector tools — `github_list_issues`, `github_summarize_issue`, `github_list_milestones`, `github_get_repository_context`
- `packages/mcp-server/src/server.ts`: version bumped to `0.8.0`
- `validate-agent-files.sh`: expanded with Phase 8 GitHub connector checks
- `ROADMAP.md`: v0.8.0 marked as released, v0.9.0 marked as next

---

## [v0.7.0] — 2026-07-01

### Added in v0.7.0

- `packages/mcp-server/`: Oh My PM MCP Server alpha — TypeScript/Node.js/pnpm, stdio transport, read-only, local context only, no external connector required
- `packages/mcp-server/src/tools/inspect-project-context.ts`: reads AGENTS.md, VERSION, README.md to return project identity
- `packages/mcp-server/src/tools/diagnose-project.ts`: structured project diagnosis from local docs (ROADMAP.md, CHANGELOG.md)
- `packages/mcp-server/src/tools/prepare-agent-handoff.ts`: generates self-contained handoff prompt under 300 words
- `packages/mcp-server/src/tools/summarize-delivery-status.ts`: delivery status summary from ROADMAP.md and CHANGELOG.md
- `packages/mcp-server/src/resources/registry.ts`: three resources — `project://current`, `project://risks/open`, `project://decisions/open`
- `packages/mcp-server/src/prompts/registry.ts`: three prompts — `diagnose-project`, `prepare-agent-handoff`, `summarize-delivery-status`
- `packages/mcp-server/src/policy/read-only.ts`: read-only constraint enforcement and tool allowlist
- `packages/mcp-server/src/policy/bilingual.ts`: technical identifier preservation rules (API, rollback, sprint, backlog, QA, CI/CD)
- `packages/mcp-server/src/policy/token-limits.ts`: response size bounds (max 50 list items, 300-word handoff cap)
- `packages/mcp-server/src/utils/safe-files.ts`: safe local file reading — path traversal rejection, sensitive file pattern exclusion
- `packages/mcp-server/src/utils/formatting.ts`: structured response shape helpers (ok, partial, error)
- `packages/mcp-server/tests/`: 4 test files, 16 tests — read-only policy, tool schemas, safe file reading, bilingual policy
- `packages/mcp-server/examples/client-config.example.json`: MCP client configuration example
- `packages/mcp-server/examples/requests.example.md`: tool invocation examples with sample responses
- `packages/mcp-server/README.md`: install, configure, and run documentation
- `docs/mcp-alpha-scope.md`: resolves all Phase 6 open questions — SDK version, auth model, project root discovery, stale data signaling, connector degradation, env var names, tool/resource/prompt scope
- `package.json` (root): minimal workspace root for pnpm
- `pnpm-workspace.yaml`: declares `packages/*` workspace
- `validate-agent-files.sh`: expanded from 111 to 133 checks — Phase 7 MCP server alpha checks (22 new)

### Changed in v0.7.0

- `docs/mcp.md`: open questions section now points to `docs/mcp-alpha-scope.md` as resolved
- `docs/supported-tools.md`: MCP status updated to reflect v0.7.0 alpha shipped
- `docs/compatibility.md`: MCP known limitation updated to reflect v0.7.0 availability
- `ROADMAP.md`: v0.7.0 marked as in progress
- `.gitignore`: added `packages/mcp-server/dist/` and `packages/mcp-server/coverage/`

---

## [v0.6.0] — 2026-06-30

### Added in v0.6.0

- `docs/mcp.md`: deepened MCP planning document — what MCP will do, what it won't do, read-only-first policy, planned tools, resources, prompts, connector roadmap, security principles, bilingual behavior, open questions
- `docs/mcp-interface-design.md`: new — MCP interface design covering design principles, server identity, tool naming conventions, resource naming, prompt naming, input/output shapes, error handling, read-only-first policy, write action gating, bilingual response behavior, token-efficient behavior, local repository context boundaries
- `docs/mcp-security-policy.md`: new — MCP security policy covering credentials, read-only default, write action gating, connector allowlist, no telemetry, no background network calls, no broad scans, least privilege, auditability, failure-safe behavior
- `docs/mcp-connector-roadmap.md`: new — connector sequencing and design for all 7 planned connectors (v0.7.0 alpha through v0.13.0 Notion), each with purpose, read-only capabilities, potential future write capability, risks, non-goals, required configuration, testing approach
- `docs/architecture.md`: added layer model diagram (core skill layer, installable pack layer, future MCP layer), expanded MCP section with why MCP is optional, why MCP must not contradict AGENTS.md, how MCP relates to agent behavior
- `docs/security-model.md`: added MCP security section — credentials, read-only default, connector allowlist, no telemetry, no broad scans, failure-safe behavior
- `docs/supported-tools.md`: added MCP status section and planned connector table (v0.7.0–v0.13.0)
- `docs/compatibility.md`: updated MCP known limitation to reflect v0.6.0 documentation status
- `README.md`: added MCP future section with v0.6.0 and v0.7.0 description
- `ROADMAP.md`: marked v0.6.0 as in progress

---

## [v0.5.0] — 2026-06-30

### Added in v0.5.0

- All 12 playbooks deepened with full operational structure: Purpose, When to use, Inputs needed, Fast-start questions, Recommended process, Output structure, Decision rules, Risk checks, Quality checklist, Common mistakes, Bilingual notes, Related templates, Related scenarios
- `playbooks/project-intake.md`: intake signal checklist table (7 signals), fast-start questions, scope control rules
- `playbooks/project-diagnosis.md`: RAG status rules table, critical path format, blocker escalation rules
- `playbooks/scope-control.md`: scope change impact analysis format, signs of scope creep list, escalation criteria
- `playbooks/delivery-planning.md`: milestone quality rules, critical path identification, capacity assumption guidance
- `playbooks/backlog-prioritization.md`: framework selection guide table, MoSCoW, RICE guidance, dependency-aware sequencing
- `playbooks/risk-review.md`: blocker vs risk vs issue table, risk scoring matrix, mitigation vs contingency distinction, trigger definition
- `playbooks/prd-review.md`: gap severity table, acceptance criteria quality bar, success metric quality bar
- `playbooks/marketing-plan-review.md`: critical path for marketing launches, common risk table with mitigation, measurement readiness checklist
- `playbooks/launch-readiness.md`: go/no-go decision format, full launch readiness checklist (engineering, marketing, support), rollback planning questions
- `playbooks/stakeholder-update.md`: audience calibration table (4 types), escalation format, decision request format, bad news communication steps, Persian stakeholder notes
- `playbooks/retrospective.md`: root cause depth guidance, action item quality bar, timebox guidance
- `playbooks/ai-agent-handoff.md`: token efficiency rules, handoff structure format, do-not list pattern, 300-word cap
- All 6 EN templates deepened: `project-brief.md`, `prd.md`, `roadmap.md`, `risk-register.md`, `decision-log.md`, `status-report.md` — full tables, scoring guides, decision principles
- All 6 FA templates updated to match EN depth with natural Persian: `project-brief.md`, `prd.md`, `roadmap.md`, `risk-register.md`, `decision-log.md`, `status-report.md`
- All 3 EN prompts improved: `diagnose-project.md`, `create-delivery-plan.md`, `create-next-agent-prompt.md` — context-first, focused inputs, token-efficient output structure
- All 3 FA prompts improved: `diagnose-project.md`, `create-delivery-plan.md`, `create-next-agent-prompt.md` — technical identifier preservation rules, compact output structure
- Improved example outputs for all 4 project types: marketing, product, and mixed-delivery outputs expanded with critical path, risk tables, immediate actions, and key decisions
- `validate-agent-files.sh`: 65 → 103 checks — Phase 5 coverage for all 12 playbooks, 6 EN templates, 6 FA templates, 6 EN prompts, 6 FA prompts, 8 example outputs

### Changed in v0.5.0

- `validate-agent-files.sh`: expanded with Phase 5 structural checks

---

## [v0.4.0] — 2026-06-30

### Added in v0.4.0

- `tests/evaluation-rubric.md`: manual evaluation rubric with 10 scoring dimensions (1–5 scale), 5 pass/fail gates, and scenario-specific guidance
- `tests/scenarios/README.md`: scenario index with domain, language, purpose, golden output, and primary behavior under test for all 7 scenarios
- Golden outputs for 4 previously uncovered scenarios: `software-prioritization.output.md`, `marketing-launch-plan.output.md`, `product-prd-review.output.md`, `token-discipline.output.md`
- Improved all 7 scenarios: added failure modes, tightened pass criteria, added related golden output cross-references
- Added `validate-agent-files.sh` checks: `tests/scenarios/README.md`, `tests/evaluation-rubric.md`, and all 7 golden output files

### Changed in v0.4.0

- `validate-agent-files.sh`: expanded with Phase 4 evaluation layer checks

---

## [v0.3.0] — 2026-06-30

### Added in v0.3.0

- Expanded `glossary/fa-en.md` with 20+ new PM/delivery terms: DRI, SOW, UAT, RACI, rollback, handoff, change request, owner, assignee, due date, impact, effort, confidence, escalation, kickoff, sign-off, capacity, non-goals, and transliteration notes
- Abbreviation table in glossary expanded with DRI, SOW, UAT, and usage context column
- Transliteration notes section in glossary explaining when to use transliteration vs full Persian
- Expanded `chatgpt-skill` and `codex-skill` bilingual references: mixed input handling, bad-translation avoidance table, Persian quality checklist, full term conventions, bilingual section format guide
- Expanded `docs/bilingual-support.md`: mixed input behavior, correct/incorrect output examples, extended term table, related docs section
- Updated `.cursor/rules/70-bilingual-fa-en.mdc`: added mixed-input handling rule, rollback/escalation/blocker/owner/critical path terms, reference to skill bilingual doc
- Improved FA prompts: added mixed-input handling rules, technical identifier preservation guidance, and self-contained handoff instruction to all three Persian prompts
- Added critical path section to `tests/golden/mixed-delivery.output.md`
- Enriched `tests/golden/fa-project-diagnosis.output.md` with one-line status rationale and expanded decisions section
- Improved test scenarios: added pass criteria for critical path, RAG status, and identifier preservation; added golden output cross-references
- Added 17 new checks to `validate-bilingual.sh`: bilingual skill references (2), FA/EN scenario files (2), golden output files (2), FA example parity (8), EN example parity (8)
- Minor polish to `templates/fa/project-brief.md`, `templates/fa/status-report.md`, `templates/fa/decision-log.md`
- Deepened all 11 domain reference files in `chatgpt-skill` and `codex-skill` from starter skeletons to full operational references, synchronized across both skill packages: project-management, delivery-management, software-delivery, marketing-ops, product-management, technical-product-management, product-marketing, prioritization, risk-management, stakeholder-communication, token-efficiency

### Changed in v0.3.0

- `validate-bilingual.sh`: expanded from 21 to 42 checks

---

## [v0.2.0] — 2026-06-29

### Added in v0.2.0

- `--self-test` flag on all install and uninstall scripts — verifies preconditions without modifying files
- `--version` flag on install scripts — prints pack version and exits
- `--help` flag on all installer scripts — prints usage and exits
- `--force` flag on uninstall scripts — skips confirmation prompt
- `--backup` flag on `install-cursor.sh` and `install-codex.sh` — creates timestamped backup before replacing
- `--scope <claude|cursor|codex|all>` flag on `verify-install.sh` — scope-targeted verification
- Conflict detection in all install scripts — prints conflict and available options instead of silently skipping
- Version-aware upgrade path — install scripts detect existing files and guide upgrade with `--force --backup`
- Backup rotation format: `.backup-oh-my-pm-YYYYMMDD-HHMMSS/` in the target directory
- Rollback instructions printed after backup creation
- `set -eu` safe shell baseline in all installer scripts
- `--target` argument parsing hardened — rejects empty or missing values with a clear error
- Unknown flag detection — all scripts now exit with an error on unrecognised options
- Installer existence and executability checks in `validate-agent-files.sh`
- Installer flag presence checks (`--self-test`, `--help`, `--backup`) in `validate-agent-files.sh`
- `install.json` existence check in `validate-agent-files.sh`

### Changed in v0.2.0

- `install-claude.sh`: upgraded from `set -e` to `set -eu`; argument parsing changed from `for` loop to `while/case` for correct `--target` value handling
- `install-cursor.sh`: added `--backup`, `set -eu`, conflict detection, `--help`, `--self-test`, `--version`
- `install-codex.sh`: added `--backup`, `set -eu`, conflict detection for `AGENTS.md`, `--help`, `--self-test`, `--version`; pre-flight checks added for source and target directories
- `uninstall-claude.sh`, `uninstall-cursor.sh`, `uninstall-codex.sh`: added `set -eu`, `--force`, `--self-test`, `--help`; clean exit when nothing is installed
- `verify-install.sh`: added `--scope`, `--help`; additional Cursor rule checks; replaced `for arg in "$@"` loop with `while/case` for correct option parsing
- `docs/installer-spec.md`: expanded with upgrade behavior, conflict detection, backup format, rollback, self-test, and flag table
- `docs/upgrading.md`: expanded with dry-run, conflict detection, self-test, and rollback instructions
- `docs/installation.md`: updated flag tables for all three installers; added upgrade section
- `docs/security-model.md`: added `--self-test`, `set -eu`, and generated asset commitment notes

---

## [v0.1.0-alpha] — 2024

### Added in v0.1.0-alpha

- Initial repository foundation for Oh My PM
- `AGENTS.md` — source of truth for agent behavior
- `CLAUDE.md` — Claude Code adapter
- `.cursor/rules/` — Cursor rules (9 files)
- `chatgpt-skill/oh-my-pm/` — ChatGPT Skill skeleton
- `codex-skill/oh-my-pm/` — Codex Skill skeleton
- `packs/claude/`, `packs/cursor/`, `packs/codex/`, `packs/generic/` — installable packs
- `installers/` — safe install, uninstall, and verify scripts
- `scripts/` — validation and release build scripts
- `docs/` — public documentation (14 files)
- `glossary/fa-en.md` — Persian/English terminology glossary
- `templates/en/` and `templates/fa/` — paired bilingual templates
- `prompts/en/` and `prompts/fa/` — paired bilingual prompts
- `examples/` — synthetic project examples
- `tests/scenarios/` and `tests/golden/` — scenario and golden output starters
- `.github/workflows/` — CI validation and release workflows
- `.github/ISSUE_TEMPLATE/` — bug, feature, and bilingual quality templates
- GitHub Actions for validation and release

### Notes for v0.1.0-alpha

- This is an alpha release. The install contract may change before v1.0.0.
- MCP support is planned for v0.7.0 as a future optional integration layer.
- See `ROADMAP.md` for the full version roadmap.
