# Changelog

All notable changes to Oh My PM are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [VERSIONING.md](VERSIONING.md).

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
