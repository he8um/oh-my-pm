# Oh My PM Project State Report

_Audit date: 2026-07-01. Repository: `oh-my-pm`, branch `main`, HEAD at `58405d3` ("chore: prepare v1.0.0 release"). This report was produced by direct command execution, direct file reads, and cross-checked file-diff verification. Every finding below is either directly observed (commands run, files read, diffs executed) or explicitly labeled as inferred._

---

## 1. Executive Summary

Oh My PM is an open-source, MIT-licensed "Head of Delivery" agent kit that installs structured project/product/software/marketing delivery behavior into AI coding and chat tools (Claude Code, Cursor, Codex, ChatGPT, and any `AGENTS.md`-reading generic agent), plus an optional read-only MCP server with six PM-tool connectors (GitHub, ClickUp, Airtable, Linear, Jira, Notion). The project just tagged `v1.0.0`, declaring the install contract, pack contract, and MCP read-only contract stable.

**Status after v1.0.0**: All four validation scripts, all seven installer self-tests, `verify-install.sh --help`, the MCP server's typecheck/test/build pipeline (258 tests across 28 suites), and `build-release.sh` all pass in this environment. The repository is clean per `git status`. However, the v1.0.0 stabilization pass was incomplete in two concrete ways: (1) several documentation files still describe MCP as "planned"/"future"/a "planning document" despite it having shipped six connectors, and (2) the Codex pack's installed skill content (`packs/codex/.agents/skills/oh-my-pm/`) is a materially thinner, stale draft (roughly 4-5x shorter per file) relative to its canonical `codex-skill/oh-my-pm/` counterpart, with its own `VERSION` file still reading `v0.1.0-alpha`.

**Overall maturity assessment**: The core agent-behavior layer (`AGENTS.md` + adapters) and the MCP server's read-only security posture are both genuinely solid — the read-only guarantee is enforced architecturally (HTTP clients that simply have no write methods), not just by policy prose. The weakest areas are: skill/pack content professionalism (no end-to-end worked examples, no troubleshooting sections, thin cross-file example coverage), documentation lifecycle hygiene (stale "planned" language that survived a dedicated stabilization pass), and the absence of any live-account validation for the six connectors (all tests are mocked, by design).

**Highest-value next work**: Fix the identified documentation staleness and the Codex pack skill-content drift (both are P0/P1, low-effort, high-trust-impact), then invest in a skill professionalization pass (worked examples, troubleshooting, retrospective/post-mortem reference file) before any new feature work.

**Top 3 strengths**:
1. The MCP read-only guarantee is enforced at the code level (every connector client exposes only `GET`, or Linear/Notion's two narrowly hardcoded read-only paths) — verified directly, not just documented.
2. The 12-reference skeleton used across both ChatGPT and Codex skills (Purpose → When to use → Principles → Template → Common mistakes → Bilingual note) is consistent, well-reasoned, and includes real thresholds/anti-patterns rather than generic PM platitudes.
3. Root-vs-pack drift control is real where it's supposed to be: `.cursor/rules/` is byte-identical between the repo root and `packs/cursor/`, confirmed via `diff -r`.

**Top 3 weaknesses**:
1. `packs/codex/.agents/skills/oh-my-pm/` — the skill content actually delivered by `install-codex.sh` — is stale and thin (e.g., `delivery-management.md` is 30 lines there vs. 189 lines in the canonical `codex-skill/`), and its `VERSION` file (`v0.1.0-alpha`) was never bumped. No validator catches this because `validate-release.sh` only checks the top-level `packs/codex/VERSION`, not the nested skill's `VERSION`.
2. At least five documents (`AGENTS.md`, `docs/faq.md`, `docs/philosophy.md`, `docs/mcp-connector-roadmap.md`, `docs/mcp-security-policy.md`, `docs/mcp-interface-design.md`, `docs/mcp-alpha-scope.md`) retain "planned"/"future"/"planning document" framing for MCP despite it having shipped — most seriously, `docs/faq.md` line 33 flatly states "It is not available in the current version," which is false at v1.0.0.
3. No worked end-to-end example (full input → full structured output) exists in any of the 12 skill reference files, and no troubleshooting/failure-mode section exists anywhere in the skill, pack, or top-level docs (verified by direct grep).

**Top 3 risks**:
1. **Maintenance/drift risk**: three near-duplicate skill trees (`chatgpt-skill/`, `codex-skill/`, `packs/codex/.agents/skills/oh-my-pm/`) exist with no generation/sync tooling, and one has already silently diverged.
2. **Documentation trust risk**: a first-time user reading `docs/faq.md` will conclude MCP does not exist at all, directly contradicting the shipped README/CHANGELOG/ROADMAP.
3. **Unvalidated-in-production risk** (accepted, documented): all six connectors are tested against mocks only; no live-account smoke test has been run as part of this audit or, per the repo's own `docs/release-readiness-v1.0.0.md`, as part of the v1.0.0 promotion (the manual QA checklist item for this is unchecked).

---

## 2. Current Release State

| Item | Value |
| --- | --- |
| Current version (VERSION files, `install.json`, `package.json` at root) | `v1.0.0` (root `package.json` still shows `0.7.0` — see Section 16) |
| Latest git tag | `v1.0.0` (confirmed via `git tag --list "v*"`; full list: v0.1.0-alpha, v0.2.0–v0.13.0, v1.0.0) |
| Release state | Stable, non-prerelease per `docs/release-readiness-v1.0.0.md` and `ROADMAP.md` |
| Connector roadmap status | Complete as declared — GitHub, ClickUp, Airtable, Linear, Jira, Notion all shipped v0.8.0–v0.13.0; `docs/mcp-connector-roadmap.md` and `docs/supported-tools.md` both explicitly state no further connector is currently planned |
| Repo cleanliness | `git status --short` → clean (no output) at audit start and after this audit's file operations, aside from an untracked `pnpm-lock.yaml` generated by this audit's own `pnpm install` step (never previously tracked; left untracked, not staged) |
| Validation status | `validate-agent-files.sh` 277/277 passed; `validate-skill.sh` 38/38 passed; `validate-bilingual.sh` 42/42 passed; `validate-release.sh` 11/11 passed |
| Known manual QA gap | `docs/release-readiness-v1.0.0.md`'s own Manual QA checklist (6 items, e.g. "at least one connector tool call exercised against a real account") is entirely unchecked (`- [ ]` for all items, 0 checked across the whole 61-item document) — this audit did not perform live-account testing either, consistent with the "no real API calls" policy, but the gap is real and undocumented as resolved |

---

## 3. Repository Map

| Area | Purpose |
| --- | --- |
| `docs/` | 26 files covering architecture, philosophy, security, bilingual policy, installation/upgrade, compatibility, MCP design/security/roadmap, and one doc per connector. Mixed currency — some rewritten to present tense for v1.0.0, some not (see Section 12). |
| `tests/` | Manual evaluation harness: `evaluation-rubric.md` (10 scored dimensions + 5 pass/fail gates), `scenarios/` (7 input scenarios), `golden/` (7 target outputs). Not automated; requires a human or agent run plus manual scoring. |
| `scripts/` | Validation and packaging: `validate-agent-files.sh`, `validate-skill.sh`, `validate-bilingual.sh`, `validate-release.sh`, `build-release.sh`, `package-*.sh` (3), `generate-checksums.sh`, `check-links.sh`. All bash, POSIX-oriented. |
| `installers/` | `install-*.sh` / `uninstall-*.sh` for claude/cursor/codex plus `verify-install.sh`. Consistent flag surface: `--dry-run`, `--force`, `--backup`, `--target`, `--self-test`, `--help` (install scripts also support `--version`). |
| `packs/` | Four installable, self-contained directories (`claude/`, `cursor/`, `codex/`, `generic/`), each with its own `VERSION` and README, copied into user projects by the installers. |
| `chatgpt-skill/` | `oh-my-pm/` skill package for ChatGPT: `SKILL.md`, `VERSION`, `agents/openai.yaml`, 12 `references/*.md`. Canonical/most current version of the skill content. |
| `codex-skill/` | Byte-identical reference-content twin of `chatgpt-skill/` (differs from it in only 2 lines of `SKILL.md` prose), packaged separately for Codex-targeted distribution via `scripts/package-codex-skill.sh`. |
| `.cursor/rules/` | 9 `.mdc` rule files defining Cursor-specific behavior; confirmed byte-identical to `packs/cursor/.cursor/rules/`. |
| `packages/mcp-server/` | TypeScript/Node MCP server (`@oh-my-pm/mcp-server`, package version `1.0.0`). Six connector subdirectories, local-context tools, resources, prompts, a read-only policy module, and a safe local-file-read utility. 28 Jest test suites, 258 tests, all passing. |

Also present but outside the audit's primary focus, all inspected briefly: `playbooks/` (12 files), `templates/en|fa/` (6 each), `prompts/en|fa/` (3 each), `examples/` (4 project types × 4 files each = 16), `glossary/fa-en.md`, `_dev/` (39 internal working files, properly gitignored), `.github/` (2 workflows, 3 issue templates, 1 PR template).

---

## 4. Product Definition

**What Oh My PM is**: a reusable, installable "delivery leadership layer" — a set of markdown behavioral instructions (source of truth in `AGENTS.md`) adapted per AI tool, plus an optional TypeScript MCP server that exposes read-only project data from six PM tools. It is explicitly positioned as *not* a one-off prompt pack but a persistent behavioral contract an agent adopts once installed.

**What it is not** (per `AGENTS.md` lines 100-105): a generic AI assistant, a code generator (except incidentally within delivery artifacts), a replacement for legal/compliance/financial domain expertise, or (per the same section, now stale — see Section 12) "a real-time data connector," which contradicts the shipped MCP connectors.

**Target users**: product managers, engineering leads/delivery managers, and teams using Claude, Cursor, Codex, or ChatGPT for delivery work (per `README.md` "Who it is for").

**Supported targets**: Claude Code (`CLAUDE.md`), Cursor (`.cursor/rules/*.mdc`), Codex (`AGENTS.md` + Codex Skill), ChatGPT (ChatGPT Skill), and any generic `AGENTS.md`-compatible agent — five install surfaces plus the optional MCP layer.

**Core value proposition**: agents gain delivery judgment (prioritization, risk surfacing, stakeholder communication calibration, critical-path discipline, token discipline) without the user re-explaining PM fundamentals every session, and can do so bilingually in Persian/English.

**Why `AGENTS.md` matters**: it is declared the single behavioral source of truth (`AGENTS.md` line 111-113, `docs/architecture.md` line 20-26). All tool adapters are meant to format — not extend or contradict — this file's policy. This audit found this principle is honored in spirit for tone/role/domain-list content, but found real content drift in the Codex skill's installed reference files (Section 9) and one stale MCP-related claim inside `AGENTS.md` itself (Section 7), which is ironic given `AGENTS.md`'s own status as the thing everything else must stay consistent with.

**How packs and skills relate to source-of-truth behavior**: packs are self-contained condensed restatements of `AGENTS.md` for a given tool's file conventions (not literal copies — this is by design, confirmed via direct diff). Skills go further and add 12 domain-specific reference documents beyond what `AGENTS.md` itself contains, extending depth without (in principle) contradicting the source file.

**How MCP complements but does not replace the agent contract**: `docs/architecture.md` and `docs/mcp.md` are explicit that MCP is a "data-access layer" only — it provides raw project data, but `AGENTS.md` still governs how that data is interpreted and presented. This separation is real in the code: MCP tools return structured JSON-ish data with a `data_source`/`status` envelope; nothing in the MCP server's source instructs the agent on tone, prioritization, or structure — that remains entirely the job of the markdown behavioral layer.

---

## 5. Stable Capabilities

| Capability | Explanation |
| --- | --- |
| Agent behavior layer | `AGENTS.md` (127 lines) defines role, 12 supported domains, 4 core behavior categories, language policy, 11 trigger contexts, and explicit source-of-truth precedence. |
| Installable packs | Four self-contained directories (Claude, Cursor, Codex, Generic), each versioned and installable via a dedicated script (except Generic, which is manual-copy only by design). |
| ChatGPT Skill | `chatgpt-skill/oh-my-pm/` — `SKILL.md` + `agents/openai.yaml` (OpenAPI 3.1 stub, `paths: {}`) + 12 reference docs. This is the canonical, most current skill content. |
| Codex Skill | `codex-skill/oh-my-pm/` — byte-identical to the ChatGPT skill's references and `openai.yaml`; differs only in `SKILL.md`'s two title/description lines. |
| Claude pack | `packs/claude/CLAUDE.md` + `README.md` + `VERSION` — condensed adapter, installs as a single file. |
| Cursor pack | `packs/cursor/.cursor/rules/*.mdc` (9 files) — confirmed byte-identical to root `.cursor/rules/`. |
| Generic `AGENTS.md` pack | `packs/generic/AGENTS.md` — tool-agnostic condensed adapter, manual install only. |
| Read-only MCP server | `packages/mcp-server/` — Node/TypeScript, stdio transport only, no HTTP transport. |
| Six read-only connectors | GitHub, ClickUp, Airtable, Linear, Jira, Notion — each with its own config/client/types/errors module, tools, and dedicated doc. |
| Scenario/golden-output evaluation | 7 scenario files mapped 1:1 to 7 golden outputs, scored via a 10-dimension + 5-gate manual rubric. |
| Bilingual FA/EN support | Paired FA/EN templates, prompts, and examples; a shared glossary; explicit correct/incorrect worked examples in `docs/bilingual-support.md` and `references/bilingual-fa-en.md`. |
| Release validation scripts | `validate-agent-files.sh`, `validate-skill.sh`, `validate-bilingual.sh`, `validate-release.sh` — all passed in this audit (368 total checks). |
| Installer self-tests | All 6 install/uninstall scripts plus `verify-install.sh --help` passed in this audit. |

---

## 6. Install and Pack Contract

**Install flow**: each `install-<tool>.sh` resolves its own repo root, checks for existing target files, and either installs directly (no conflict) or reports options (conflict, no `--force`). All scripts use `set -eu`, make no network calls, and collect no telemetry (confirmed by reading all three install scripts and `docs/security-model.md`).

**Per-tool behavior differences found**:
- `install-claude.sh`: single-file copy (`CLAUDE.md`), conflict-protected.
- `install-cursor.sh`: per-file granularity across the 9 `.mdc` files — skips existing files individually unless `--force`, allowing a partial prior install to be topped up safely.
- `install-codex.sh`: two independent actions. The `AGENTS.md` copy is conflict-protected like Claude's. **The skill-directory copy (`cp -r "$SOURCE_SKILL/." "$TARGET_SKILL/"`) is unconditional — it always overwrites, regardless of `--force` or prior existence.** This is inconsistent with `docs/installer-spec.md`'s stated "no destructive overwrite by default" rule and was flagged independently by the pack-system audit (Section 9 has full detail).

**Uninstall flow**: `uninstall-claude.sh`, `uninstall-cursor.sh`, `uninstall-codex.sh` support `--dry-run`, `--force`, `--target`, `--self-test`, `--help` (no `--version`, which is a documented, intentional omission per `docs/release-readiness-v1.0.0.md` line 41). All prompt for confirmation unless `--force`; all scoped only to files Oh My PM installs.

**Verify-install behavior**: `installers/verify-install.sh` checks file *presence* (not content or version) for each scope (`claude`, `cursor`, `codex`, `all`), including all 9 Cursor `.mdc` files by name. Its own top-of-file usage comment (not the `--help` output, which is correct) has a copy-paste error repeating `--target` where it should say `--scope` — cosmetic, not functional.

**Backup behavior**: `--backup` creates a timestamped backup directory before any overwrite; install scripts print the backup path and restore command. Confirmed described consistently in `docs/upgrading.md`, `docs/installation.md`, and `docs/security-model.md`.

**Upgrade behavior**: the documented and only supported upgrade path is re-running install with `--force --backup` (per `docs/upgrading.md`, `VERSIONING.md`, `docs/release-readiness-v1.0.0.md`).

**Release asset naming**: `oh-my-pm-v<version>-<target>.zip` for chatgpt-skill, codex-skill, claude-pack, cursor-pack, generic-agent-pack, all confirmed produced correctly-named in this audit's `build-release.sh` run (Section 16), plus `checksums.txt` and `validation-report.md`.

**Checksums**: SHA-256, generated fresh by `scripts/generate-checksums.sh`; confirmed present and non-empty in this audit's build output.

**Pack contents / version consistency**: all 6 top-level `VERSION` files (`packs/claude`, `packs/cursor`, `packs/codex`, `packs/generic`, `chatgpt-skill/oh-my-pm`, `codex-skill/oh-my-pm`) read `v1.0.0` and pass `validate-release.sh`. **Two version strings outside that check's scope are stale**: `packs/codex/.agents/skills/oh-my-pm/VERSION` = `v0.1.0-alpha`, and `packs/generic/AGENTS.md` line 50 prose footer = `v0.13.0`. Both are real defects (Section 9, Section 16).

**Known limitations**: no installer script exists for the Generic pack (manual `cp` only, by design, but not called out as intentional anywhere a user would see it); `docs/installer-spec.md`'s upgrade-behavior table implies version-aware conflict detection for Cursor that does not actually exist in `install-cursor.sh` (which only checks file existence, not version/content).

---

## 7. Agent Contract and Behavioral Core

`AGENTS.md` is concise (127 lines) and well-structured: Role → Supported domains → Core behaviors (Delivery thinking, Structured output, Token discipline, Stakeholder communication) → Language behavior → Trigger contexts → What this is not → Source of truth → Related files.

**Strengths**: the "Core behaviors" section gives concrete, checkable rules rather than platitudes (e.g., "Identify the critical path before recommending action," "Every output should answer: what needs to happen next, by whom, and by when"). The language-behavior section is specific about what stays in English (code, CLI, APIs, schemas, package names, filenames, config keys) versus what shifts to Persian (management/delivery/stakeholder/risk/decision contexts) — this policy is consistently propagated into `docs/bilingual-support.md`, the Cursor bilingual rule, and the skill's `bilingual-fa-en.md` reference (verified by direct comparison).

**Weaknesses found**:
- **Line 105 is stale**: "A real-time data connector (MCP connectors are planned for future versions)" — six MCP connectors have shipped as of v0.13.0/v1.0.0. This is a direct self-contradiction inside the document that `docs/architecture.md` and every adapter is supposed to stay consistent with, and it was not corrected during the v1.0.0 stabilization pass despite that pass explicitly rewriting other docs (`docs/mcp.md`, `docs/architecture.md`, `docs/security-model.md`) to present tense (per `CHANGELOG.md`'s own v1.0.0 entry).
- The 11-item "Trigger contexts" list (lines 84-96) is not fully mirrored into either skill's `SKILL.md` frontmatter description — "Run a retrospective or post-mortem" is listed as a trigger, but **no retrospective/post-mortem reference file exists in either skill's 12 references**, despite `playbooks/retrospective.md` existing at the playbook layer. This is a capability-vs-documentation gap: the source of truth promises a workflow the skill layer doesn't back with depth.
- No explicit safety/scope-boundary statement is repeated in either `SKILL.md` — a reader who only sees the packaged skill (not `AGENTS.md`) would not see the "what this is not" boundaries at all.
- No worked example or edge-case guidance exists in `AGENTS.md` itself (by design — it's meant to be terse, with depth pushed to skill references and playbooks), but the corresponding depth is missing in the reference layer too, per Section 8.

**Tool-specific adapter consistency**: `CLAUDE.md`, `.cursor/rules/*.mdc`, and pack copies are consistent in role/domain/behavior framing (spot-checked and confirmed word-for-word or near-word-for-word on role description and domain list). The Cursor rules use a sensible always-apply/context-apply split (`00-` core and `90-` token-discipline are `alwaysApply: true`; domain rules `10`-`70` are context-activated).

---

## 8. Skill System Audit

Both `chatgpt-skill/oh-my-pm/` and `codex-skill/oh-my-pm/` share the same 12 reference files, the same `agents/openai.yaml`, and near-identical `SKILL.md` files (differing in exactly 2 lines: title and one description sentence — "for use in ChatGPT" vs. "for use with Codex-compatible agents"). `VERSION` in both is `v1.0.0` and byte-identical.

**Trigger quality**: `SKILL.md`'s frontmatter description lists ~9 concrete trigger verbs/actions ("analyze a project, plan delivery, prioritize work, review risks, create status reports, review PRDs, prepare launches, generate agent handoffs, or optimize project execution") — specific and verb-anchored, not vague. Gaps: no explicit negative triggers (when *not* to activate), no language-detection trigger stated in `SKILL.md` itself even though Persian-input activation is a first-class behavior elsewhere, and the list is a compressed subset of `AGENTS.md`'s 11 triggers (drops "retrospective/post-mortem" and "diagnose delivery blockers/scope creep" as explicit phrases).

**Instruction depth**: uniformly strong across all 12 reference files. Every file follows the same skeleton — Purpose, When to use, Core operating principles, structured output template, Common mistakes to avoid, Bilingual note — and each contains real reasoning (e.g., `risk-management.md` has an explicit risk/blocker/issue distinction table and a precise Red-status promotion rule; `delivery-management.md` spells out the critical-path method step by step with a 70-80% capacity-planning heuristic; `token-efficiency.md` gives concrete output-length calibration). This is a genuine strength — it reads as a designed system, not ad hoc notes.

**ChatGPT vs. Codex skill diff**: effectively identical (2 cosmetic lines differ out of 59 in `SKILL.md`; everything else byte-identical). This means the "Codex Skill" provides zero Codex-specific adaptation (no CLI/sandbox/tool-use framing). Combined with the fact that `packs/codex/.agents/skills/oh-my-pm/` is a *third*, independently-stale copy of this same content (Section 9), there are three parallel trees to keep in sync with no generation/build tooling found in-repo to do so automatically.

**Consistency with AGENTS.md**: role framing, domain list, and language policy are propagated near-verbatim. Token discipline gets its fullest treatment in `token-efficiency.md`. The clearest gap is the missing retrospective/post-mortem reference file despite it being a named `AGENTS.md` trigger, and the stale MCP "planned" framing in `AGENTS.md` is not contradicted or corrected anywhere in the skill (the skill simply never mentions MCP at all — a silent omission rather than a propagated error, but still a coverage gap).

**Safety boundaries**: no explicit "read-only" or "no write actions" statement appears in either `SKILL.md` or any reference file. This is defensible in one sense — the skills are pure markdown instruction sets with no tool bindings (`agents/openai.yaml` has `paths: {}`, confirmed directly) — but it means a reader auditing the skill package alone, without cross-referencing `AGENTS.md` or the MCP docs, cannot verify the boundary from the skill content itself. No prompt-injection/untrusted-content-handling guidance exists, which is a plausible gap for a skill designed to ingest arbitrary pasted PRDs/documents.

**Bilingual behavior**: genuinely strong where it appears — `bilingual-fa-en.md` and `docs/bilingual-support.md` both include explicit correct-vs-incorrect worked examples (e.g., flagging "رابط برنامه‌نویسی" as a bad literal translation of "API"), which is one of the strongest instructional devices in the whole reference set. Weakness: this contrastive-example technique appears in only 2 of the 12 reference files — the other 10 domain files (risk, technical PM, software delivery, marketing ops, etc.) each have only a one-line "Bilingual note" pointing at the glossary, with no domain-specific Persian example. Given bilingual support is marketed as a first-class differentiator, this is thin. Two "canonical" FA/EN term tables have also silently diverged in size (`docs/bilingual-support.md` has 20 rows; `references/bilingual-fa-en.md` has 32) — not contradictory, but not single-sourced either.

**Examples and troubleshooting**: no full end-to-end worked example (complete input → complete structured output) exists in any of the 12 reference files — only short fragments/snippets. No dedicated troubleshooting or runtime-failure-mode section exists anywhere (e.g., "what if the user gives no risk data at all," "what if RAG status is disputed by the sponsor"); the existing "Common mistakes to avoid" sections address authoring/output-quality mistakes, not runtime recovery scenarios.

**Packaging and versioning**: `SKILL.md`/`VERSION`/references are structurally correct and pass `validate-skill.sh` (38/38). However, `agents/openai.yaml` line 7 (`version: v0.1.0-alpha`) is stale in **all three** shipped copies (chatgpt-skill, codex-skill, and packs/codex) — confirmed by direct `grep` across all three files. This is a low-risk (the field is unused OpenAPI metadata, `paths: {}`) but real version-consistency defect that no validator currently checks.

### Skill scoring table

| Area | Score / 10 | Current State | Gap | Recommendation |
| --- | --- | --- | --- | --- |
| Trigger clarity | 7 | Concrete, verb-based `SKILL.md` description | No negative triggers; retrospective trigger has no backing reference | Add 2-3 negative-trigger examples; add a retrospective/post-mortem reference file |
| Instruction depth | 8 | Consistent 6-part skeleton with real thresholds/anti-patterns in all 12 files | Checklist density is uneven (0 items in 7 files, 17-24 in others) | Normalize checklist usage or document why some files intentionally use prose/tables instead |
| Workflow coverage | 6 | Covers PM/delivery/marketing/risk/comms well | No retrospective/post-mortem file despite being a named AGENTS.md trigger | Add `references/retrospective.md` mirroring `playbooks/retrospective.md` depth |
| Safety boundaries | 5 | Product-level read-only posture is real and documented elsewhere | Neither SKILL.md nor references state scope/safety limits explicitly | Add a short "Scope and limits" section to SKILL.md mirroring AGENTS.md's "What this is not" |
| Bilingual behavior | 7 | Strong contrastive examples in 2 of 12 files; consistent terminology | 10 of 12 domain files have no worked Persian example | Add one short FA/EN contrastive example per remaining domain file |
| Output quality guidance | 8 | Concrete output-length calibration and structured templates in nearly every file | None major | Maintain current standard as new references are added |
| Examples | 4 | Short fragments/snippets only | No full end-to-end worked example in any of the 12 files | Add one complete input→output example per domain, or a shared `examples.md` reference |
| Troubleshooting | 3 | "Common mistakes" sections cover authoring errors only | No runtime failure-mode guidance anywhere | Add a "When information is missing" subsection per reference file |
| Packaging | 7 | Clean SKILL.md/references/agents structure, correct frontmatter | Triple-copy skill trees with no sync tooling | Consider a single-source template + generation script for chatgpt/codex/packs-codex variants |
| Versioning | 4 | VERSION and SKILL.md correctly at v1.0.0 | `agents/openai.yaml` stuck at v0.1.0-alpha in all 3 copies; `packs/codex` skill VERSION also stale | Bump openai.yaml version fields; add nested skill VERSION to validate-release.sh |
| Cross-target consistency | 9 | chatgpt-skill and codex-skill differ in only 2 cosmetic lines | packs/codex copy has diverged substantially (see Section 9) | Treat packs/codex/.agents/skills as a build artifact of codex-skill, not a hand-maintained copy |
| Professional readiness | 7 | Disciplined, well-reasoned PM writing throughout | Held back by stale version fields, missing safety statement, no worked examples | Address P0/P1 items in Section 23 before promoting skills as "professional-grade" externally |

---

## 9. Pack System Audit

**Claude pack** (`packs/claude/`): `README.md`, `CLAUDE.md`, `VERSION` (v1.0.0). Single-file install. Content is a condensed, self-contained restatement of `AGENTS.md` plus a "Language policy" section. No version drift found.

**Cursor pack** (`packs/cursor/`): `README.md`, `VERSION` (v1.0.0), 9 `.mdc` files. **Confirmed byte-identical to root `.cursor/rules/`** via `diff -r .cursor/rules packs/cursor/.cursor/rules` (exit 0, no output) — this matches the explicit v1.0.0 exit criterion in `docs/release-readiness-v1.0.0.md`. Adapter format is correct: proper MDC frontmatter, `00-`/`90-` are `alwaysApply: true`, domain rules `10`-`70` are context-activated.

**Codex pack** (`packs/codex/`): `README.md`, `AGENTS.md`, `VERSION` (v1.0.0 — top level, correct), `.agents/skills/oh-my-pm/` (SKILL.md, `agents/openai.yaml`, 12 references, its own `VERSION`). `SKILL.md` and `agents/openai.yaml` inside this nested skill directory are byte-identical to the canonical `codex-skill/oh-my-pm/` copies. **The 12 `references/*.md` files inside `packs/codex/.agents/skills/oh-my-pm/` are a significantly older, thinner draft** — independently verified by direct line-count and diff:

| Reference file | `codex-skill/` (canonical) | `packs/codex/.agents/skills/` (actually installed) |
| --- | --- | --- |
| `delivery-management.md` | 189 lines | 30 lines |
| `prioritization.md` | 133 lines | 42 lines |
| (pattern across all 12 files) | avg. ~140 lines | avg. ~31 lines |

A direct diff of `prioritization.md` shows the installed version is missing ICE scoring, dependency-aware sequencing, risk-adjusted priority guidance, conflict resolution steps, "common mistakes," and the bilingual glossary note that the canonical file has. **This means `install-codex.sh` currently ships materially less skill depth than the standalone `codex-skill` artifact, despite both being described as "the Codex Skill."** The nested `VERSION` file inside this directory reads `v0.1.0-alpha`, confirmed directly — it was never bumped to v1.0.0.

Root cause (verified): `scripts/validate-release.sh` line 53 checks only `packs/codex/VERSION` (the top-level pack version), and `scripts/validate-agent-files.sh`'s VERSION lockstep check (around line 467) similarly omits the nested `packs/codex/.agents/skills/oh-my-pm/VERSION` path. No validator diffs the two skill trees against each other, so this drift passed every automated check, including this audit's own script runs.

**Generic pack** (`packs/generic/`): `README.md`, `AGENTS.md`, `VERSION` (v1.0.0). Manual-copy install only (no installer script exists for it — this is by design and consistent with `installers/` containing no `install-generic.sh`, but the intentionality is not documented anywhere a user would see it). **`packs/generic/AGENTS.md` line 50 has a stale prose footer reading `Version: v0.13.0`**, contradicting its own correct `VERSION` file — confirmed by direct read. This is exactly the class of defect `docs/release-readiness-v1.0.0.md` line 51 says should not exist ("No pack file contains a stale hardcoded version string in prose"), and it slipped through because the validator only checks `VERSION` files, not prose strings inside content files.

**Root vs. pack-copy drift — summary**:
- `.cursor/rules/` ↔ `packs/cursor/.cursor/rules/`: byte-identical (correct, verified).
- `AGENTS.md` ↔ `packs/codex/AGENTS.md` / `packs/generic/AGENTS.md`: intentionally different (condensed adapters, by design, consistent with the stated pack philosophy).
- `codex-skill/oh-my-pm/` ↔ `packs/codex/.agents/skills/oh-my-pm/`: **unintended drift** — same skill, meant to be equivalent, materially different in both content depth and version string.

**Installer behavior**: see Section 6 for the full flow; the one asymmetry worth repeating here is that `install-codex.sh`'s skill-directory copy is the only installer action in the entire install layer that unconditionally overwrites regardless of `--force`, which is inconsistent with the stated "no destructive overwrite by default" installer-spec rule.

**Pack README quality**: all four pack READMEs are minimal — install command plus one-line description of pack contents. None mention running `verify-install.sh` after install, none include a troubleshooting note, none include a before/after example of agent behavior change.

**Professionalization needs**: (1) fix the two stale version strings, (2) either regenerate `packs/codex/.agents/skills/oh-my-pm/references/` from `codex-skill/oh-my-pm/references/` or add a validator that diffs the two trees, (3) make `install-codex.sh`'s skill-copy step conflict-aware and `--force`-gated like every other installer action, (4) add a one-line "run `verify-install.sh` after installing" note to each pack README.

---

## 10. MCP Server Audit

**Package structure**: `@oh-my-pm/mcp-server` v1.0.0, TypeScript/Node (`engines.node >= 20`), ESM (`"type": "module"`), built with `tsc`, tested with `jest`/`ts-jest`. Dependency footprint is minimal: only `@modelcontextprotocol/sdk` as a runtime dependency.

**Server registration** (`src/server.ts`, `src/resources/registry.ts`, `src/prompts/registry.ts`): tools are registered directly in `server.ts` via `server.tool(name, description, zodSchema, handler)`; resources and prompts are registered via two separate registry modules called from `server.ts`. Direct counts (grepped directly against source, not inferred from docs): **35** `server.tool(...)` calls, **18** `server.resource(...)` calls, **18** `server.prompt(...)` calls. Every tool handler returns the same uniform response shape: `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`. Local-context tools use a `verb_noun` naming pattern (`inspect_project_context`, `diagnose_project`); connector tools use `<connector>_<verb>_<noun>` (`github_list_issues`, `jira_list_boards`) to stay unambiguous when multiple connectors are configured simultaneously.

**Central read-only policy mechanism**: `src/policy/read-only.ts` (77 lines) defines six `*_READ_ONLY_TOOLS` `Set`s (one per connector) plus a `LOCAL_READ_ONLY_TOOLS` set, and an `isReadOnlyTool(toolName)` function that checks membership across all seven sets. **This is a test-only allowlist, not an active runtime gate** — confirmed by grepping every call site of `isReadOnlyTool(` across `src/` and `tests/`: it is called exclusively from the 7 `*-read-only-policy.test.ts` files (one per connector plus one for local tools); `server.ts` never calls it, and no dispatch/middleware layer routes tool execution through it before running a handler. `enforceReadOnly(server)` — the function actually invoked once in `server.ts`, before tool registration — is, verified directly, an empty function body with only a comment: "No write tools are registered. Write actions require all five conditions from docs/mcp-security-policy.md." So today's guarantee rests entirely on the fact that no write tool is registered in `server.ts` at all (35 tools total: 4 local + 4 GitHub + 7 ClickUp + 5 Airtable + 5 Linear + 5 Jira + 5 Notion, all backed by non-mutating client code) — the allowlist is a regression tripwire on tool *naming*, not a structural barrier on tool *execution*. If a future contributor added, say, `github_create_issue` to `server.ts` without also updating `read-only.ts`, nothing in the running server would block it; only human code review would.

The actual, stronger guarantee is architectural, one level down: connector HTTP clients (`connectors/*/client.ts`) simply do not implement `post`/`put`/`patch`/`delete` methods — confirmed by direct inspection of all six `client.ts` files. GitHub, ClickUp, Airtable, and Jira clients expose only `async get<T>(path)`, with the HTTP method hardcoded to `"GET"` inside the method body. Linear exposes only `async query<T>(...)`, always POSTing `{query, variables}` to GraphQL — required by GraphQL's transport, not a write signal — built from a fixed set of hardcoded query constants (no dynamic query construction found at any of its 5 call sites; no `mutate()` method exists on the class). Notion exposes a public `get()` (always GET) plus a narrowly-scoped `postQuery(path, body)` used at exactly 2 call sites in the entire codebase (`/search` and `/databases/{id}/query`), matching Notion's two documented read-only-despite-being-POST endpoints — confirmed by direct read of `notion/client.ts`. **This client-level restriction is a stronger guarantee than the policy layer alone** — there is no write capability to "turn on" by mistake in five of six connectors; it does not exist in the client code at all. Notion is the partial exception worth flagging precisely: `postQuery(path: string, body)` accepts a caller-supplied path string with no compile-level restriction to the two intended endpoints — today every call site correctly uses only `/search` and `/databases/{id}/query`, but the safety of this one method depends on call-site discipline rather than the type system, unlike the other five connectors where the write HTTP verbs are simply absent from the class.

**Tools/resources/prompts by connector** (tool file count, direct listing):

| Connector | Tool files |
| --- | --- |
| GitHub | 4 (`list-issues`, `summarize-issue`, `list-milestones`, `get-repository-context`) |
| ClickUp | 7 (`list-tasks`, `summarize-task`, `summarize-list-status`, `list-spaces`, `list-folders`, `list-lists`, `get-workspace-context`) |
| Airtable | 5 (`list-bases`, `list-tables`, `describe-table`, `list-records`, `summarize-base-status`) |
| Linear | 5 (`list-issues`, `summarize-issue`, `summarize-project-status`, `list-teams`, `list-projects`) |
| Jira | 5 (`list-issues`, `summarize-issue`, `summarize-project-status`, `list-projects`, `list-boards`) |
| Notion | 5 (`search-pages`, `summarize-page`, `query-database`, `summarize-database`, `get-page-context`) |
| Local context | 4 (`inspect_project_context`, `diagnose_project`, `prepare_agent_handoff`, `summarize_delivery_status`) |

**Token limits / bilingual / formatting**: pagination is bounded per connector — default 25 items per list tool, hard max 100 (enforced regardless of user request), confirmed identically worded across all six connector docs. Long text fields are truncated to 500 characters with a truncation marker, consistently across connectors. Tool names/resource URIs are English-only; output language follows the user/project setting (per `docs/mcp.md` "Bilingual behavior" section) — this is a documentation claim about agent behavior downstream of the MCP layer, not something enforced in the MCP server's own code (correctly so, since formatting for the end user is the agent's job, not the data layer's).

**Test coverage**: 28 Jest suites, 258 tests, all passing (`pnpm --filter @oh-my-pm/mcp-server test`, run directly in this audit). Coverage includes per-connector config, tools, formatting, and read-only-policy test files, plus `safe-files.test.ts`, `tool-schemas.test.ts`, and `bilingual-policy.test.ts`. All connector tests use mocked HTTP/GraphQL responses — confirmed no live API calls exist in the test suite (per `docs/mcp-security-policy.md`'s stated policy and spot-checked test file contents).

**Build/typecheck/test status** (this audit, all commands run directly against a fresh `pnpm install`):
- `pnpm --filter @oh-my-pm/mcp-server typecheck` → pass (0 errors)
- `pnpm --filter @oh-my-pm/mcp-server test` → pass (28/28 suites, 258/258 tests)
- `pnpm --filter @oh-my-pm/mcp-server build` → pass (tsc completed, no errors)

**Transport status**: stdio only. No HTTP transport exists in the codebase (confirmed absent; `docs/mcp-alpha-scope.md` mentions HTTP transport as a hypothetical "v0.9.0+" future item written during v0.6.0 planning — that forward-reference is itself now stale since v0.9.0 shipped the ClickUp connector, not HTTP transport). `docs/release-readiness-v1.0.0.md` explicitly lists stdio-only as an accepted, documented limitation at v1.0.0, not a gap to close.

---

## 11. Connector Audit

All six connector docs share an identical 18-section structure (Purpose, Read-only-first policy, Supported/Unsupported surfaces, Required/Optional configuration, Least-privilege token guidance, No-credential-storage policy, No-write-actions policy, Failure/degraded behavior, Rate-limit behavior, Pagination and item limits, Tool/Resource/Prompt lists, Delivery semantics, Test approach, Future write-capability policy, Related docs) — confirmed by direct heading extraction across all six files. This structural consistency is a genuine strength for maintainability and user trust.

### GitHub
Tools: 4 (issues, issue summary, milestones, repository context). Auth: personal access token, **optional** for public repos (only connector with an unauthenticated fallback — unauthenticated requests still work at GitHub's public rate limit of 60/hr vs. 5000/hr authenticated). Env vars (verified directly in `connectors/github/config.ts`): `OH_MY_PM_GITHUB_OWNER` (required), `OH_MY_PM_GITHUB_REPO` (required), `OH_MY_PM_GITHUB_TOKEN` (optional), `OH_MY_PM_GITHUB_API_BASE_URL` (optional, defaults to `https://api.github.com`). Read-only verified: client exposes only `get()`. Rate limits: reads `x-ratelimit-remaining`, warns below 10, structured error on 429/exhaustion, no retry loop. Pagination: 25 default / 100 hard max; issue bodies truncated to 500 chars; comments not fetched by default. Known limitations: no PRs, no Projects v2 (GraphQL), no Actions/workflows, no org-level data, no repo file contents. Risk level: **Low** — narrowest auth surface, only connector with a no-token path, verified GET-only client.

### ClickUp
Tools: 7 (most of any connector — includes folder/list hierarchy browsing in addition to tasks). Auth: API token, documented as **required**, no unauthenticated fallback (missing token returns a degraded response, not a crash — though `config.ts` itself only hard-fails on the missing workspace ID, not the missing token; the token requirement surfaces as a 401 at first request time rather than a config-load throw). Env vars (verified directly): `OH_MY_PM_CLICKUP_WORKSPACE_ID` (required, hard-fails at config load if missing), `OH_MY_PM_CLICKUP_TOKEN` (required per docs, soft-fails at request time), `OH_MY_PM_CLICKUP_SPACE_ID` / `OH_MY_PM_CLICKUP_FOLDER_ID` / `OH_MY_PM_CLICKUP_LIST_ID` (all optional, scope reads to a subtree), `OH_MY_PM_CLICKUP_API_BASE_URL` (optional). Read-only verified: client exposes only `get()`. Pagination: 25/100 default/hard max; task descriptions truncated to 500 chars. Known limitations: no Docs, no time tracking, no comments/custom fields by default, no webhooks. Risk level: **Low** — GET-only client, degraded-not-crash on missing config.

### Airtable
Tools: 5 (bases, tables, table schema, records, base status summary). Auth: personal access token, required, no fallback. Env vars: `OH_MY_PM_AIRTABLE_TOKEN`, `OH_MY_PM_AIRTABLE_BASE_ID` (both required). Read-only verified: client exposes only `get()`. Field detection (owner/status/due-date) is heuristic pattern-matching, not a fixed schema — documented explicitly as a known limitation since Airtable bases have no fixed schema. Known limitations: no attachments, no automations/interfaces, no multi-base joins, heuristic field detection can misfire on unusual field names. Risk level: **Low** — GET-only client; main risk is data-quality (misclassified fields), not security.

### Linear
Tools: 5 (issues, issue summary, project status summary, teams, projects). Auth: API key, required, no fallback. Env vars: `OH_MY_PM_LINEAR_TOKEN`, `OH_MY_PM_LINEAR_TEAM_ID` (both required). Read-only verified: client exposes only `query()`; all 5 call sites use hardcoded GraphQL query constants with no dynamic query-string construction found — `grep` for "mutation" in the Linear connector source returns only the client's own comment confirming no mutation is ever sent. Known limitations: cycles/sprints deferred (team structure varies too much for a reliable default), comments not fetched by default, no Roadmap/Documents, sub-issue trees not expanded. Risk level: **Low** — GraphQL surface is a plausible write vector in other systems, but verified fully closed here (no mutation capability exists in the client).

### Jira
Tools: 5 (issues, issue summary, project status summary, projects, boards). Auth: HTTP Basic (email + API token) — the only connector not using bearer-token auth. Required, no fallback. Env vars: `OH_MY_PM_JIRA_BASE_URL`, `OH_MY_PM_JIRA_EMAIL`, `OH_MY_PM_JIRA_TOKEN`, `OH_MY_PM_JIRA_PROJECT_KEY` (all four required — the largest required-config surface of any connector). Read-only verified: client exposes only `get()`. Known limitations: Jira Cloud only (no Data Center/Server), custom-field mapping is a documented heuristic fallback (`customfield_10016`), no Confluence/Service Management integration, issue links not expanded. Risk level: **Low** — GET-only client, but the four-variable required config is the highest setup friction of the six.

### Notion
Tools: 5 (search pages, summarize page, query database, summarize database, page context). Auth: internal integration token, required, no fallback (plus a manual, undetectable-in-advance step: the integration must be explicitly shared with the target page/database by a workspace member, or reads 404). Env vars: `OH_MY_PM_NOTION_TOKEN` (required), plus `OH_MY_PM_NOTION_PAGE_ID` or `OH_MY_PM_NOTION_DATABASE_ID` (at least one required for scoped tools), `OH_MY_PM_NOTION_API_BASE_URL` (optional). Read-only verified: client (`notion/client.ts`, read directly in full) exposes a private `request(path, method: "GET"|"POST", body)` and only two public methods — `get()` (always GET) and `postQuery(path, body)`, used at exactly 2 call sites in the entire codebase (`/search`, `/databases/{id}/query`) — both Notion's documented read-only-despite-POST endpoints; a dedicated test (`notion-read-only-policy.test.ts`) asserts the client source never matches a `post/put/patch/del` + `Page/Block/Database` pattern. Known limitations: nested blocks beyond the first level not fetched, comments not fetched by default, rich-text formatting/annotations dropped (plain text only), no block append/editing of any kind. Risk level: **Low, with one structural caveat** — `postQuery(path, body)` takes a caller-supplied path string with no compile-time restriction to the two intended endpoints; every current call site is correct (verified directly), but this is architecturally weaker than the other five connectors, where write HTTP verbs are simply absent from the client class rather than being possible-but-unused.

### Comparison table

| Connector | Tools | Resources | Prompts | Auth Model | Read-only Exceptions | Main Limitation | Risk Level |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub | 4 | Yes (per registry) | Yes | Bearer PAT (optional for public repos) | None — GET only | No PRs, Projects v2, or Actions | Low |
| ClickUp | 7 | Yes | Yes | Bearer API token (required) | None — GET only | No Docs, time tracking, or comments by default | Low |
| Airtable | 5 | Yes | Yes | Bearer PAT (required) | None — GET only | Heuristic field-name matching (no fixed schema) | Low |
| Linear | 5 | Yes | Yes | Bearer API key, GraphQL (required) | Fixed read-only GraphQL queries only, never a mutation | Cycles/sprints deferred | Low |
| Jira | 5 | Yes | Yes | HTTP Basic (email + token, required) | None — GET only | 4 required env vars; custom-field heuristic | Low |
| Notion | 5 | Yes | Yes | Bearer internal integration token (required) | 2 hardcoded read-only POST paths (`/search`, `/databases/{id}/query`), reached via a path-parameterized method | No nested blocks beyond first level; no rich text | Low (structural caveat — see subsection) |

**Concerns identified**: none of the six connector clients expose more than documented — this audit independently verified this claim rather than trusting the docs (Section 15 has the full write-verb scan classification). Two specific, verified nuances:

1. **Docs vs. code on "required" tokens.** Every non-GitHub connector's docs and README state the token env var is "Required: Yes." In the actual `config.ts` for ClickUp/Airtable/Linear/Jira/Notion, there is no `throw` on a missing token specifically — only structural identifiers (workspace ID, base ID, team ID, base URL + project key) cause a hard failure at config-load time. The token's "required" status is instead enforced later, at first request time, surfacing as a 401 → `auth_failed` degraded response. This is not a security hole (behavior still matches the documented "degraded response, not a crash" contract) but it means "Required: Yes" in the README/doc tables slightly overstates what `config.ts` itself enforces — the real distinction (hard-fail at load vs. soft-fail at request) isn't visible from the tables alone.
2. **Notion's `postQuery(path, body)`** is the one method across all six clients that takes a caller-supplied path string with no compile-time restriction to the two intended endpoints (see Section 10) — every current call site is correct, but this is a structurally weaker guarantee than the other five connectors' hardcoded-verb pattern.

The other design choice worth flagging is that `enforceReadOnly()` in `read-only.ts` is currently a documentation-only no-op and `isReadOnlyTool()` is called only from test files, never from `server.ts` (Section 10) — if a future contributor ever adds a write-capable tool to `server.ts` without also adding a corresponding client method and updating the allowlist, nothing in the running server would block it. This is not a defect today — the architecture is closed — but it's worth strengthening before any hypothetical future write-action work.

---

## 12. Documentation Audit

**Quickstart**: present and coherent — `README.md` "Quick start" → `docs/installation.md` → `docs/usage.md`, consistently cross-linked.

**Troubleshooting**: no dedicated troubleshooting document exists anywhere in the repository (confirmed by grep across `README.md`, `docs/faq.md`, `docs/installation.md`, and all four pack READMEs — no "troubleshoot" hits). Failure-mode coverage is scattered: `docs/upgrading.md` has a rollback section, `docs/faq.md` covers exactly one gotcha (the global-gitignore issue with `AGENTS.md`/`CLAUDE.md`), and connector docs have developer-facing API-error tables, not end-user troubleshooting.

**Diagrams**: only two ASCII diagrams exist, both in `docs/architecture.md` (a file-tree listing and a three-layer block diagram) — both are plain nested text, not true flow/sequence diagrams. No Mermaid or image diagrams anywhere in the repository.

**Stale "MCP is planned/future" language — the most significant documentation finding.** `docs/release-readiness-v1.0.0.md` itself states as a v1.0.0 criterion: "no doc describes shipped functionality as 'planned' or 'future'." This audit found the criterion is **not fully met**:

| File | Stale text | Severity |
| --- | --- | --- |
| `docs/faq.md:33` | "MCP integration is planned for v0.7.0 as a future optional layer. It is not available in the current version." | High — directly false, user-facing FAQ |
| `AGENTS.md:105` | "A real-time data connector (MCP connectors are planned for future versions)" | High — inside the declared source-of-truth file |
| `docs/philosophy.md:25-27` | Section headed "MCP is optional and future"; "MCP integration is planned as an optional data access layer" | Medium — philosophy doc, less operationally load-bearing but still visible |
| `docs/mcp-connector-roadmap.md:5` | "No connectors are implemented in v0.6.0. This is a planning document." | Low — contradicted later in the same file, which correctly marks all 6 connectors "Released" |
| `docs/mcp-security-policy.md:5` | "This is a planning document. No MCP implementation exists in v0.6.0." | Low — same pattern, contradicted later in the same file |
| `docs/mcp-interface-design.md:5` | "This is a planning document. No implementation exists in v0.6.0." | Low — same pattern |
| `docs/mcp-alpha-scope.md:5` | "This is a public planning document..." | Low — arguably accurate as a historical decision record, but not updated to note the decisions were carried out |
| `docs/compatibility.md:7-8, 42` | Version table stops at v0.13.0 (no v1.0.0 row); "The install contract may change before v1.0.0" (v1.0.0 has shipped) | Medium — directly contradicts `docs/release-readiness-v1.0.0.md`'s own stated criterion that this table cover the full range through the current version |
| `docs/supported-tools.md:13` | Section still headed "## Planned support" though every row underneath says "shipped" | Low — cosmetic/labeling inconsistency, content itself is accurate |

By contrast, `docs/mcp.md`, `docs/architecture.md`, and `docs/security-model.md` were genuinely and correctly rewritten to present tense for v1.0.0 (verified by direct read) — confirming the stabilization pass was real but incomplete, not entirely absent.

**Release-readiness document hygiene**: `docs/release-readiness-v1.0.0.md` contains 61 checklist items, all formatted as unchecked `- [ ]` (confirmed via direct count: 61 unchecked, 0 checked), despite the document's "Blocking issues" section stating "None currently open." Based on this audit's own validation runs, the underlying criteria largely do appear satisfied — but the document's stated purpose is to be "a single, checkable definition of done," and as shipped it reads as an unexecuted template rather than a genuinely completed gate.

**Connector docs**: all six share an identical, well-organized 18-section structure (Section 11) — this is a real strength; no structural inconsistency found across them.

**Other gaps**: no dedicated user guide beyond `docs/usage.md`'s example-prompt list; no changelog-to-doc cross-reference automation (manual, per `docs/architecture.md`'s `check-links.sh` description); `docs/mcp-alpha-scope.md` line 33 references "If HTTP transport is added (v0.9.0+)" — stale, since v0.9.0 shipped the ClickUp connector, not HTTP transport, and no HTTP transport plan exists anywhere else in current docs.

---

## 13. Scenario, Golden Output, and Evaluation Audit

Seven scenario files map 1:1 to seven golden output files, with one naming mismatch resolved only via the scenarios README's table (`mixed-fa-en-repo-review.md` → `mixed-delivery.output.md`, not `mixed-fa-en-repo-review.output.md`).

| Scenario | Golden | Domain | Language |
| --- | --- | --- | --- |
| `en-project-diagnosis.md` | `en-project-diagnosis.output.md` | Delivery | English |
| `fa-project-diagnosis.md` | `fa-project-diagnosis.output.md` | Delivery (same premise as above) | Persian |
| `mixed-fa-en-repo-review.md` | `mixed-delivery.output.md` | Delivery (same premise) | Mixed FA/EN |
| `software-prioritization.md` | `software-prioritization.output.md` | Product/Software | English |
| `product-prd-review.md` | `product-prd-review.output.md` | Product | English |
| `marketing-launch-plan.md` | `marketing-launch-plan.output.md` | Marketing | English |
| `token-discipline.md` | `token-discipline.output.md` | Cross-cutting | English |

**Domain coverage gaps identified**: three of the seven scenarios (EN/FA/Mixed project diagnosis) are language variants of essentially one delivery-diagnosis premise, meaning true domain diversity is closer to 4-5 distinct scenarios (delivery, prioritization, PRD review, marketing, token discipline) than 7. No pure-Persian marketing or product scenario exists — Persian coverage exists only for the delivery-diagnosis domain. No software-only scenario distinct from the product-prioritization framing. **No negative/adversarial scenario exists** — every scenario targets a "good output" target; none test prompt-injection resistance, deliberately ambiguous/insufficient input, or pair the rubric with a worked bad-output example for calibration.

**Evaluation rubric quality**: moderately rigorous. Strengths: 10 weighted scoring dimensions with 5/3/1 behavioral anchors, 5 hard pass/fail gates that override scoring regardless of dimension averages (no private-data leakage, no hallucinated integrations, no unsupported write-action claims, no full-repo-scan claims, no technical-identifier translation), a numeric pass threshold (average ≥3.5, no individual dimension = 1), and per-scenario-type dimension-weighting guidance. Weaknesses: scoring anchors are only defined for 5/3/1, leaving 2 and 4 to evaluator interpretation; the rubric is entirely manual with no automation or CI gate; no worked/pre-scored example exists to calibrate evaluators against each other.

---

## 14. Bilingual FA/EN Audit

Persian quality is genuinely strong where demonstrated: natural professional phrasing (not machine-literal), correct transliteration conventions consistent across `glossary/fa-en.md`, `docs/bilingual-support.md`, and the skill's `bilingual-fa-en.md` reference (بک‌لاگ/backlog, ریلیز/release, رول‌بک/rollback, مسیر بحرانی/critical path, استیک‌هولدر/stakeholder all consistent). The explicit correct-vs-incorrect contrastive examples in `docs/bilingual-support.md` and `references/bilingual-fa-en.md` are a strong pedagogical device (e.g., flagging "رابط برنامه‌نویسی" as an incorrect literal translation of "API," "دوی سرعت" as an incorrect literal translation of "sprint").

Technical term preservation policy is clear and consistently stated: code, CLI commands, API names, package names, filenames, config keys, environment variables, and common PM transliterations (rollback, backlog, sprint, release, kickoff) always stay in English, even in fully Persian output.

RTL/LTR is not explicitly discussed anywhere in the documentation (no CSS/rendering guidance, which is reasonable since output is plain markdown text, not a rendered UI — this is likely a non-issue but was not explicitly addressed, so is noted as unaddressed rather than resolved).

**Gaps found**: the contrastive correct/incorrect example technique — the single strongest bilingual teaching device in the project — appears in only 2 of the skill's 12 domain reference files. The other 10 (risk management, technical PM, software delivery, marketing ops, product marketing, prioritization, project management, delivery management, token efficiency, stakeholder communication's non-comms sections) each carry only a one-line glossary-pointer "Bilingual note," with no domain-specific worked Persian example. Two term tables (`docs/bilingual-support.md`, 20 rows; `references/bilingual-fa-en.md`, 32 rows) have silently diverged in coverage rather than one explicitly deferring to the other, though both correctly point to `glossary/fa-en.md` as the intended full reference, which mitigates the risk of contradiction.

Skill behavior in Persian is asserted consistently (agent responds in Persian for management contexts, preserves English identifiers) but, per Section 8, is only demonstrated with a worked example in the stakeholder-communication and bilingual-fa-en references — not shown in practice for risk, technical PM, or software-delivery domains specifically.

---

## 15. Security and Privacy Audit

**No credential storage**: confirmed — all connector tokens are read from environment variables at runtime only (`process.env["OH_MY_PM_<X>_TOKEN"]`, verified directly in each connector's `config.ts`); none are written to disk or logged.

**Env var model**: consistent naming convention `OH_MY_PM_<CONNECTOR>_<FIELD>` across all six connectors, documented per-connector doc and in `packages/mcp-server/README.md`.

**Token redaction**: test files include explicit negative assertions that tokens never leak into output — e.g., `github-tools.test.ts` asserts JSON output `.not.toContain("ghp_")` and `.not.toContain("github_pat_")`; `linear-tools.test.ts` asserts `.not.toContain("lin_api_")`; `clickup-tools.test.ts` asserts `.not.toContain("pk_")`. These are real, targeted tests, not just documentation claims.

**Read-only connectors**: verified at the code level for all six (Section 10, Section 11) — every client exposes only `GET`, or narrowly hardcoded read-only paths for Linear (GraphQL query-only) and Notion (`/search`, `/databases/{id}/query`).

**No telemetry**: confirmed by reading `docs/security-model.md`, `docs/mcp-security-policy.md`, and the installer scripts directly — no network calls exist anywhere in the installer layer; the MCP server makes network calls only on explicit tool invocation.

**No write actions**: confirmed both by documentation review and independent source-code verification (Section 15's scan below).

**No private/internal references**: the only "Digikala" mentions found in the entire repository (`docs/security-model.md:31`, `.github/pull_request_template.md:25`) are both self-referential guardrail statements ("No Digikala or private company references") — i.e., declarations that no such reference exists, not an actual leak. No other private company names, internal URLs, or non-synthetic identifiers were found in this audit's reads.

**Secret scan result** (command run exactly as specified, full 462-line output manually reviewed): zero real credentials found. The overwhelming majority of matches are false positives from the broad regex — `path`/`critical path` substring hits, `.test.ts` variables literally named `path`, and `OH_MY_PM_*_TOKEN` env-var-name references (documenting the variable name, not a value). The only token-like literal strings found anywhere are `"placeholder-token"` in test setup code (e.g., `linear-tools.test.ts:13`, `notion-tools.test.ts:14`) — explicitly fake values used to satisfy config-loading code paths in tests.

**Attribution scan result**: `grep -RInE "Co-authored-by:|Generated with|Generated by|AI-generated|AI-assisted|Created with AI"` → zero matches anywhere in the repository (excluding `.git`, `_dev`, `dist`, `node_modules`).

**Anthropic/OpenAI scan result**: `grep -RInE "Anthropic|OpenAI"` → zero matches anywhere in the repository. (Note: "ChatGPT," "Claude," "Cursor," and "Codex" do appear extensively as documented supported integration targets — e.g., README's "Supported tools" table — which is expected and appropriate; these are product/platform names describing what Oh My PM installs into, not authorship claims.)

**Roadmap-leak scan result**: `grep -RInE "v0\.14\.0|Phase 14|next connector|new connector"` → the only substantive hit is `docs/release-readiness-v1.0.0.md:30`, "It does not mean new connectors are added. No new connector is in scope for v1.0.0" — this is the document correctly *denying* any next-connector plan, not leaking one. No unplanned future phase or version is referenced anywhere as if scheduled.

**Write-action-verb scan classification** (901-line raw grep output, manually reviewed and independently spot-verified against source): zero real write-action code paths found. Approximately 350 lines are documentation prose correctly describing read-only guarantees or explicitly-unsupported write actions (the connector docs' "Unsupported surfaces" tables listing "Write operations of any kind — Hard boundary"). The remaining ~550 lines are false positives from the broad regex: `assignee`/`unassigned` matching the substring "assign," `updated_at`/`createdTime`/`archived` timestamp/boolean fields being *read* from API responses (not written), `permission_denied`/`permission_level` error codes and read-only scope descriptors (not permission grants), and test setup code like `delete process.env["OH_MY_PM_LINEAR_TOKEN"]` (deleting a local environment variable in a test, not a remote delete operation). Direct source verification confirmed: every connector's `client.ts` exposes only `get()` (GitHub, ClickUp, Airtable, Jira), or a narrowly-scoped `query()`/`postQuery()` restricted to hardcoded read-only paths (Linear, Notion) — no `post`, `put`, `patch`, or `delete` HTTP method exists in any connector client. No hidden write-mode flag, environment variable, or CLI switch was found (`grep` for `WRITE_MODE`/`ENABLE_WRITE`/`ALLOW_WRITE`/`--write` across `src/` and `package.json` returned nothing).

**Remaining security risks**: none rated above Low for the shipped surface. The one architectural note (not a current defect) is that `enforceReadOnly()` is currently a documentation-only no-op rather than an active runtime gate — today this is safe because no write-capable client method exists to gate, but it means the read-only guarantee currently rests on "the write method was never written," not on "the write method exists but is actively blocked." Worth strengthening if write-action work is ever considered (see Section 25).

---

## 16. Release Engineering Audit

**`build-release.sh`**: ran successfully in this audit. Executes all four validation scripts, then packages ChatGPT Skill, Codex Skill, Claude pack, Cursor pack, and Generic pack into versioned zips, generates `checksums.txt`, and generates `validation-report.md`. All outputs landed in `dist/` (gitignored except `dist/.gitkeep`), confirmed correctly versioned as `oh-my-pm-v1.0.0-*.zip`.

**`validate-release.sh`**: ran successfully (11/11 checks) — confirms VERSION parity across the 6 top-level pack/skill VERSION files, presence of `dist/.gitkeep`/`checksums.txt`/`validation-report.md` after build, and that no zip files or non-`.gitkeep` dist assets are staged in git. As documented in Sections 8-9, this script's scope does **not** extend to the nested `packs/codex/.agents/skills/oh-my-pm/VERSION` or to prose version strings inside content files — both of the version-consistency defects found in this audit exist precisely in that blind spot.

**Version bump process**: per `VERSIONING.md`, semantic versioning with `-alpha`/`-beta`/no-label pre-release conventions; "All VERSION files must equal the same version string for any given release" — a rule this audit found is not fully enforced by tooling (Section 9).

**Root `package.json` inconsistency**: the repository root `package.json` (`/package.json`, not the MCP server's) still declares `"version": "0.7.0"` — confirmed by direct read. This file is marked `"private": true` and is not part of the pack/skill VERSION lockstep group, so it is lower-severity than the pack/skill drift, but it is still a stale version string inside a committed file at v1.0.0.

**GitHub release behavior**: `.github/workflows/release.yml` triggers automatically on any `v*` tag push — runs the three core validation scripts, `build-release.sh`, and uploads all dist assets to a GitHub Release via `softprops/action-gh-release@v2`. This confirms that pushing a tag is a live, consequential action in this repository's CI — correctly not performed in this audit per the task's explicit constraints (no tag creation, no push).

**Manual release burden**: `docs/release-readiness-v1.0.0.md`'s "Release command checklist" (12 steps) is entirely manual today — validation, version bumps, changelog finalization, tagging, and GitHub Release creation are all human-driven; only the CI upload step is automated (triggered by a human-pushed tag).

**What can be automated safely**: the two version-consistency defects found in this audit (nested skill VERSION, prose version strings) suggest `validate-release.sh` and `validate-agent-files.sh` could be extended to check (a) the nested `packs/codex/.agents/skills/oh-my-pm/VERSION` file, (b) a content-diff between `codex-skill/oh-my-pm/references/` and `packs/codex/.agents/skills/oh-my-pm/references/`, and (c) a grep for `Version: v` prose patterns across all pack files, not just dedicated VERSION files.

**What should stay manual**: tag creation, GitHub Release finalization, and the changelog-writing judgment call — these appropriately remain human-gated per the release-readiness doc's own rollback plan (tags are treated as immutable once pushed; patch releases are the correction mechanism).

---

## 17. Testing and Validation Audit

| Script/Test | Result | Scope |
| --- | --- | --- |
| `scripts/validate-agent-files.sh` | PASS (277/277) | Core agent files, cursor rules, packs, installers, scenarios/goldens, playbooks/templates/prompts/examples, MCP docs, all 6 connector doc+source+test triples, v1.0.0 stabilization readiness checks |
| `scripts/validate-skill.sh` | PASS (38/38) | ChatGPT/Codex skill structure, frontmatter, and all 12 reference files each |
| `scripts/validate-bilingual.sh` | PASS (42/42) | Glossary, template/prompt FA/EN parity, bilingual docs, mixed scenario, golden outputs, all example input/output pairs |
| `scripts/validate-release.sh` | PASS (11/11) | Top-level VERSION parity, dist asset hygiene, no staged zips |
| Installer self-tests (6 scripts) | PASS (6/6) | Precondition checks only — do not perform an actual install/uninstall cycle |
| `verify-install.sh --help` | PASS | Help text renders correctly, documents `--scope` and `--target` |
| MCP typecheck | PASS | `tsc --noEmit`, 0 errors |
| MCP test | PASS (258/258 across 28 suites) | All connector logic, mocked HTTP/GraphQL only |
| MCP build | PASS | `tsc` compiles cleanly to `dist/` (gitignored) |
| `build-release.sh` | PASS | Full pipeline including packaging and checksum generation |

**Coverage strengths**: validation scripts are thorough and specific (277 checks in the largest script alone), test suite includes targeted negative assertions (token-leak prevention, read-only-policy enforcement checks per connector), and mocked connector tests exercise both success and degraded/error paths (missing token, 401, rate-limited).

**Coverage weaknesses**: (1) no validator diffs `codex-skill/` against `packs/codex/.agents/skills/`, which is exactly how the content-drift defect in Section 9 went undetected; (2) no validator checks nested VERSION files or in-content prose version strings; (3) all installer self-tests check preconditions only — none actually run a full install→verify→uninstall cycle against a throwaway directory as part of automation (this is explicitly still a manual step per `docs/release-readiness-v1.0.0.md`'s Manual QA checklist); (4) all MCP/connector tests are mocked — no live-account smoke test exists in the automated suite, by explicit policy, but also not performed manually as part of this audit or (per the unchecked release-readiness checklist) as part of the v1.0.0 promotion itself.

**Manual QA gap**: `docs/release-readiness-v1.0.0.md`'s Manual QA checklist (6 items: fresh install of each pack, `--dry-run` preview accuracy, `--backup` restorability, uninstall completeness, MCP server stdio smoke test, one live-account connector call) is entirely unchecked. This audit did not perform these manual steps either (they require interactive throwaway environments and live credentials outside this audit's scope) — this gap should be treated as open, not resolved, by this report.

---

## 18. Strengths

1. **Architecturally-enforced read-only guarantee**: every connector client's HTTP method surface was read directly, not inferred from docs — none expose write-capable methods. This is a stronger and more auditable security posture than most "policy-only" integrations.
2. **Consistent, deep skill reference skeleton**: all 12 skill reference files (in both ChatGPT and Codex skills) follow the same Purpose/When-to-use/Principles/Template/Mistakes/Bilingual structure with real, specific thresholds (e.g., risk-management's precise Red-status promotion rule, delivery-management's 70-80% capacity heuristic) rather than generic PM advice.
3. **Real drift control where it matters most**: `.cursor/rules/` is verified byte-identical between the repo root and the installable Cursor pack — the one place the project's own release-readiness doc calls out as "drift here is a bug," and it isn't one.
4. **Consistent connector documentation structure**: all six connector docs share an identical 18-section skeleton, making cross-connector comparison and onboarding straightforward.
5. **Concrete, testable safety assertions**: tests don't just claim tokens are protected — they assert specific token-prefix strings (`ghp_`, `lin_api_`, `pk_`) never appear in tool output JSON.

---

## 19. Weaknesses

1. **Codex pack skill content is stale and thin relative to its own canonical source** (`packs/codex/.agents/skills/oh-my-pm/references/*.md` averaging ~31 lines vs. ~140 in `codex-skill/oh-my-pm/references/*.md`) — this matters because it is the actual content delivered to every user who runs `install-codex.sh`, and no existing validator catches the gap.
2. **"MCP is planned/future" language survives in at least 7 files** after a stabilization pass that explicitly claimed to remove it — this matters because it directly contradicts the shipped product and, in `docs/faq.md`'s case, actively misinforms a user reading the FAQ that MCP does not exist.
3. **No end-to-end worked examples anywhere in the skill layer** — this matters because the skill's core value proposition is standardized structured output, but nothing in the 12 reference files shows what a complete structured output actually looks like end to end; only fragments.
4. **No troubleshooting or runtime-failure-mode content anywhere** — this matters for a project aimed at less technical PM users who will hit install conflicts, missing tokens, or ambiguous-input situations without guidance beyond a single FAQ entry.
5. **Two independent version-consistency defects slipped past all four validation scripts** (`packs/codex/.agents/skills/oh-my-pm/VERSION` = v0.1.0-alpha; `packs/generic/AGENTS.md` prose = v0.13.0; plus `agents/openai.yaml`'s version field stuck at v0.1.0-alpha in all three skill copies) — this matters because it demonstrates the validation suite has a real, specific blind spot (nested files and in-content prose) that a determined bad actor or careless contributor could exploit or reintroduce.

---

## 20. Risks

| Category | Risk |
| --- | --- |
| Technical | `enforceReadOnly()` is a no-op today (safe only because no write client method exists); a future contributor adding a write-capable tool without matching policy work would not be blocked by this function itself. |
| Product | Three near-duplicate skill trees (chatgpt-skill, codex-skill, packs/codex skill) with no sync tooling — drift has already happened once and will recur without process change. |
| Documentation | At least 7 files retain stale "MCP is planned/future" language post-stabilization, actively misinforming users who read `docs/faq.md` or `AGENTS.md` in isolation. |
| Security | None found above Low for the shipped connector/installer surface; the only architectural note is the no-op enforcement function above. |
| Maintenance | Validation scripts do not check nested VERSION files or in-content prose version strings, and do not diff duplicate skill trees against each other — this blind spot is proven, not hypothetical. |
| Adoption | No troubleshooting content and no worked end-to-end examples raise the barrier for a first-time non-technical PM user to trust and correctly use the tool. |
| User experience | `install-codex.sh`'s unconditional skill-directory overwrite (ignoring `--force`) is the one installer action in the whole layer that doesn't respect the project's own "no destructive overwrite by default" rule. |
| Release process | The entire release pipeline (validation → build → tag → GitHub Release) is manually triggered end to end except for the CI upload step, which fires irreversibly (tags are treated as immutable) on tag push — human error at the tag-push step has real, hard-to-undo consequences per the project's own rollback plan (cut a patch release, don't delete the tag). |

---

## 21. Known Limitations

From `docs/release-readiness-v1.0.0.md`'s own "Known limitations allowed at v1.0.0" section and each connector doc's "Unsupported surfaces" tables:

- Connector tests are fully mocked; no connector has been validated against a live account as part of the automated test suite (intentional policy, not an oversight).
- Jira's custom-field mapping is heuristic (`customfield_10016` fallback), Notion fetches only first-level blocks, Linear defers cycle/sprint data, Airtable's field detection is heuristic pattern-matching — all explicitly documented per-connector limitations, not gaps.
- Uninstall scripts do not implement `--version` (deliberate design choice, documented).
- The MCP server has stdio transport only, no HTTP transport (explicitly out of scope, not a gap).
- No write action exists in any connector — stated policy, not a gap to close.
- No comments, attachments, or custom fields are fetched by default across any connector (token-cost reduction, documented per connector).

---

## 22. Development Opportunities

**Short-term** (days): fix the two version-consistency defects (Section 9, Section 16); correct the 7 stale "MCP is planned/future" documents (Section 12); make `install-codex.sh`'s skill-directory copy conflict-aware like every other installer action.

**Medium-term** (weeks): regenerate or delete-and-symlink `packs/codex/.agents/skills/oh-my-pm/references/` from `codex-skill/oh-my-pm/references/` so there is a single source of truth for that content; add validator coverage for nested VERSION files and cross-tree content diffs; add one end-to-end worked example per skill reference domain; add a dedicated troubleshooting document.

**Long-term** (quarters): consider a build/generation script that produces `chatgpt-skill/`, `codex-skill/`, and `packs/codex/.agents/skills/` from one canonical template, eliminating triple-copy drift risk structurally rather than by discipline; consider scenario coverage expansion (Persian marketing/product scenarios, one adversarial/negative scenario).

**Low-effort/high-impact fixes**: the stale version strings and stale MCP-language docs are both single-file text edits with no design risk — highest ratio of trust-repair to effort in this audit.

**High-effort/high-impact bets**: a genuine skill-professionalization pass (Section 23) and a live-account connector smoke-test harness (optional, local-only) would meaningfully close the two largest credibility gaps found (no worked examples/troubleshooting; no live validation ever performed) but both require sustained, multi-file work rather than a quick fix.

---

## 23. Skill Professionalization Roadmap

### v1.1 — Trigger and instruction refinement
**Goal**: close the trigger-clarity and source-of-truth-consistency gaps found in Section 8.
**Scope**: add negative-trigger examples to `SKILL.md` frontmatter; add a Persian-input trigger example; reconcile `AGENTS.md`'s 11 trigger contexts with what each `SKILL.md` actually lists; fix the stale `AGENTS.md:105` MCP claim.
**Files likely affected**: `chatgpt-skill/oh-my-pm/SKILL.md`, `codex-skill/oh-my-pm/SKILL.md`, `AGENTS.md`.
**Acceptance criteria**: `SKILL.md` triggers are a verifiable superset-or-equal of `AGENTS.md`'s trigger list; `validate-skill.sh` extended to check this; `AGENTS.md` contains no "planned"/"future" MCP language.
**Risks**: low — text-only changes, no behavioral code affected.
**Estimated complexity**: Low (1-2 days).

### v1.2 — Workflow templates and examples
**Goal**: close the "no end-to-end worked example" gap (Section 8, Section 19).
**Scope**: add one complete input→output worked example per domain reference file (12 total), starting with the domains that currently have zero worked examples (10 of 12); add the missing retrospective/post-mortem reference file.
**Files likely affected**: all 12 `references/*.md` files in both `chatgpt-skill/` and `codex-skill/` (and, once v1.1's dedup work lands, only one canonical location).
**Acceptance criteria**: every reference file contains at least one full input→structured-output example; a new `references/retrospective.md` exists and passes `validate-skill.sh`.
**Risks**: medium — risk of examples becoming stale relative to evolving templates/playbooks; needs a cross-reference check against `tests/golden/`.
**Estimated complexity**: Medium (1-2 weeks, primarily content-authoring effort).

### v1.3 — Troubleshooting and failure modes
**Goal**: close the "no runtime failure-mode guidance" gap (Section 8, Section 12, Section 19).
**Scope**: add a "When information is missing" or "Failure modes" subsection to each of the 12 reference files; add a dedicated top-level `docs/troubleshooting.md` covering install conflicts, missing tokens, ambiguous input, and MCP connector degraded responses.
**Files likely affected**: 12 reference files, new `docs/troubleshooting.md`, cross-links from `README.md`/`docs/faq.md`.
**Acceptance criteria**: every reference file has a failure-mode subsection; `docs/troubleshooting.md` exists and is linked from at least `README.md` and `docs/faq.md`; `check-links.sh` passes.
**Risks**: low — additive documentation only.
**Estimated complexity**: Medium (1 week).

### v1.4 — Bilingual professional output library
**Goal**: close the "only 2 of 12 reference files have a worked Persian example" gap (Section 8, Section 14).
**Scope**: add one domain-specific FA/EN contrastive example (correct vs. incorrect, matching the existing `bilingual-fa-en.md` pattern) to each of the remaining 10 reference files; reconcile the two diverged term tables (`docs/bilingual-support.md` 20 rows vs. `references/bilingual-fa-en.md` 32 rows) into a single source referenced by both.
**Files likely affected**: 10 reference files, `docs/bilingual-support.md`, `glossary/fa-en.md`.
**Acceptance criteria**: `validate-bilingual.sh` extended to check for a Persian example block in each reference file; term-table row counts reconciled or explicitly documented as intentionally different in scope.
**Risks**: medium — requires native-quality Persian PM writing per domain, not just translation; a professional Persian PM reviewer is recommended before merging.
**Estimated complexity**: Medium-High (2-3 weeks with review).

### v1.5 — Scenario-based evaluation for skills
**Goal**: close the "no automated/negative scenario coverage" gap (Section 13).
**Scope**: add at least one adversarial/negative scenario (e.g., deliberately ambiguous input, a prompt-injection attempt embedded in a pasted PRD) with a golden "correct refusal/clarification" output; add a pure-Persian marketing or product scenario; consider lightweight automation of the rubric's 5 pass/fail gates (these are largely mechanically checkable — e.g., regex-detectable technical-identifier translation, claimed-integration detection).
**Files likely affected**: `tests/scenarios/`, `tests/golden/`, `tests/evaluation-rubric.md`, `tests/scenarios/README.md`.
**Acceptance criteria**: at least one negative scenario exists with a golden "good failure" output; at least one new-domain Persian scenario exists; scenario count and domain-coverage table in `tests/scenarios/README.md` updated.
**Risks**: low — additive to an already-manual evaluation system.
**Estimated complexity**: Medium (1-2 weeks).

### v2.0 — Modular reference architecture
**Goal**: eliminate the triple-copy skill-drift risk structurally (Section 8, Section 9, Section 19).
**Scope**: design and implement a single-source template + generation mechanism (a `scripts/generate-skills.sh` or similar) that produces `chatgpt-skill/`, `codex-skill/`, and `packs/codex/.agents/skills/oh-my-pm/` from one canonical content tree, with target-specific overrides limited to `SKILL.md`'s title/description lines; consider splitting very long reference files into a "core" always-loaded tier and a "deep" on-demand tier if token budget becomes a concern as content grows (v1.2-v1.4 will add material).
**Files likely affected**: new `scripts/generate-skills.sh` (or equivalent), restructuring of where canonical reference content lives, `scripts/validate-skill.sh` and `scripts/validate-release.sh` updated to validate the generated output rather than three hand-maintained copies.
**Acceptance criteria**: only one canonical copy of reference content exists in the repository; `chatgpt-skill/`, `codex-skill/`, and `packs/codex/.agents/skills/` are build outputs, verified identical-except-target-specific-lines by an automated check; the drift found in this audit becomes structurally impossible to reintroduce.
**Risks**: medium-high — this is a build-process change affecting the release pipeline (`build-release.sh`, `package-*.sh`); requires careful migration to avoid breaking the existing packaging scripts.
**Estimated complexity**: High (3-4 weeks, includes tooling design, migration, and validator rewrite).

---

## 24. Recommended Next Phases

| Phase | Focus | Notes |
| --- | --- | --- |
| v1.0.1 | Patch hardening | Fix the two version-consistency defects (Section 9); fix the 7 stale MCP-language documents (Section 12); fix `install-codex.sh`'s unconditional skill overwrite; bump root `package.json` version. All low-risk, high-trust-value, no new features. |
| v1.1.0 | Skill professionalization | Execute Skill Professionalization Roadmap phases v1.1-v1.2 (Section 23). |
| v1.2.0 | User onboarding and docs | Add `docs/troubleshooting.md`; add worked examples to pack READMEs; document the Generic pack's manual-only install as an intentional choice. |
| v1.3.0 | Live connector smoke-test harness | An **optional, local-only** script that exercises each connector against a real account with a scoped read-only token, to finally close the Manual QA checklist gap (Section 2, Section 17) — must not run in CI or require credentials by default. |
| v1.4.0 | Release automation hardening | Extend `validate-release.sh`/`validate-agent-files.sh` to catch nested-VERSION and in-content-prose version drift; consider the v2.0 skill-generation tooling as a prerequisite or companion. |
| v2.0.0 | Optional write-action policy design (proposal only) | Per `docs/mcp-security-policy.md`'s own gating conditions — this should remain a proposal/design document until every one of the five stated conditions (written policy, explicit per-call confirmation, per-connector safety review, rollback path, minimum-scope action) is satisfied for a specific, named action. Not recommended before v1.0.1-v1.4.0 are complete. |

This audit does not recommend adding a new connector at any point in this sequence, consistent with `docs/mcp-connector-roadmap.md` and `docs/release-readiness-v1.0.0.md`'s explicit statements that the connector list is complete.

---

## 25. Open Questions

- Should the three skill trees (chatgpt-skill, codex-skill, packs/codex skill) be unified into a single generated source before or after the content-depth work in v1.1-v1.4? Doing content work first risks tripling the editing effort; doing tooling first delays the professionalization work.
- Should `enforceReadOnly()` become an active runtime gate (checking `isReadOnlyTool()` before every tool dispatch) even though no write-capable client method currently exists, purely as defense-in-depth against future contributor error?
- Should MCP gain an HTTP transport? No current plan exists; `docs/mcp-alpha-scope.md`'s original "v0.9.0+" forward-reference is now stale and should either be updated or removed rather than left dangling.
- Should live-account connector smoke tests be optional/local-only tooling, or should they remain purely a manual, undocumented developer action? The current state (manual, and not even checked off in the release-readiness doc) is arguably the weakest link in the release-readiness story.
- Should write actions ever exist, and if so, what per-action confirmation UX would be needed at the MCP tool-call layer specifically (not just session-level consent)? `docs/mcp-security-policy.md` lists five gating conditions but no UX mechanism has been designed for condition 2 ("explicit user confirmation required at the MCP tool call layer, not just at session start").
- Should a docs site (rendered, searchable) be added, or does the current flat-markdown-in-repo approach remain sufficient given the project's "no lock-in, no proprietary dependencies" philosophy?
- Should the MCP server be published to npm as `@oh-my-pm/mcp-server`, or does the current "clone the repo and build locally" model better match the project's local-first, no-telemetry positioning?

---

## 26. Final Assessment

**Is the project stable?** Yes, in the sense the v1.0.0 label claims: the install contract, pack contract, and MCP read-only contract are all functionally stable and pass every automated check run in this audit (368 validation checks, 258 MCP tests, 6 installer self-tests, a full release build). The read-only security guarantee is real and independently verified at the source-code level, not just asserted in documentation.

**Is it useful?** For its stated purpose — giving AI coding/chat tools a consistent delivery-leadership behavioral layer — yes. The behavioral content (skill references, playbooks, templates) is specific and well-reasoned, not generic PM filler.

**Is it professional enough for public use?** Mostly, with real gaps. The core behavioral and security engineering is professional-grade. What is not yet professional-grade: the Codex pack's actual delivered skill content is stale and thin relative to what the project believes it ships; multiple user-facing documents (most notably the FAQ) actively misstate that MCP doesn't exist; and there is no troubleshooting content or worked example anywhere for a user who gets stuck.

**What is the biggest gap?** The gap between what the project's own `docs/release-readiness-v1.0.0.md` claims was verified ("no doc describes shipped functionality as planned/future," "all VERSION files must equal the same version string") and what this audit independently found to still be true in several specific, named files. This is a process gap — the validation tooling has a real, demonstrated blind spot around nested files and duplicate content trees — more than a design gap.

**What should be done next?** Ship a v1.0.1 patch that fixes the specific, narrow, low-risk defects catalogued in this report (stale versions, stale MCP language, the Codex installer overwrite bug), then invest in the skill-professionalization roadmap (Section 23) before any new feature or connector work. Do not add write actions, a new connector, or an HTTP transport until the currently-shipped v1.0.0 surface is fully reconciled with what its own release-readiness document claims about it.

---

## Appendix A — Command Results

| Command | Result |
| --- | --- |
| `git status --short` | Clean (no output) |
| `git branch --show-current` | `main` |
| `git log --oneline -20` | 20 commits shown, most recent `58405d3 chore: prepare v1.0.0 release` |
| `git tag --list "v*"` | 11 tags: v0.1.0-alpha, v0.2.0, v0.3.0, v0.4.0, v0.5.0, v0.6.0, v0.7.0, v0.8.0, v0.9.0, v0.10.0, v0.11.0, v0.12.0, v0.13.0, v1.0.0 |
| `bash scripts/validate-agent-files.sh` | PASS — 277/277 checks |
| `bash scripts/validate-skill.sh` | PASS — 38/38 checks |
| `bash scripts/validate-bilingual.sh` | PASS — 42/42 checks |
| `bash scripts/validate-release.sh` | PASS — 11/11 checks |
| `bash installers/install-claude.sh --self-test` | PASS |
| `bash installers/install-cursor.sh --self-test` | PASS |
| `bash installers/install-codex.sh --self-test` | PASS |
| `bash installers/uninstall-claude.sh --self-test` | PASS |
| `bash installers/uninstall-cursor.sh --self-test` | PASS |
| `bash installers/uninstall-codex.sh --self-test` | PASS |
| `bash installers/verify-install.sh --help` | PASS (renders correctly, exit 0) |
| `pnpm install` (root, `pnpm` unavailable natively; used `npx --yes pnpm@8`) | Succeeded — 356 packages installed |
| `pnpm --filter oh-my-pm-mcp-server typecheck` (as literally specified) | Failed — "No projects matched the filters" (the package is actually named `@oh-my-pm/mcp-server`, not `oh-my-pm-mcp-server`) |
| `pnpm --filter @oh-my-pm/mcp-server typecheck` (corrected filter) | PASS — 0 type errors |
| `pnpm --filter @oh-my-pm/mcp-server test` | PASS — 28/28 suites, 258/258 tests |
| `pnpm --filter @oh-my-pm/mcp-server build` | PASS — clean `tsc` compile |
| `bash scripts/build-release.sh` | PASS — all 5 packaged assets, `checksums.txt`, and `validation-report.md` produced |
| Attribution scan (`Co-authored-by:|Generated with|...`) | Zero matches |
| Anthropic/OpenAI scan | Zero matches |
| Secret-pattern scan | Zero real credentials; ~462 lines of near-entirely false-positive matches (`path`, `OH_MY_PM_*_TOKEN` variable-name references, `"placeholder-token"` test fixtures) manually reviewed line-by-line |
| Roadmap-leak scan (`v0.14.0|Phase 14|next connector|new connector`) | One hit, correctly a denial statement in `docs/release-readiness-v1.0.0.md:30`, not a leak |
| Write-action-verb scan | Zero real write-action code paths; ~350 lines correct read-only-documentation prose, ~550 lines false positives (verified by direct inspection of all 6 connector `client.ts` files) |
| Git safety pre-commit checks (`git ls-files dist`, `git ls-files packages/mcp-server/dist`, `git check-ignore -v _dev/...`) | `dist/` and `packages/mcp-server/dist/` are not tracked (empty `ls-files` output); `_dev/` confirmed gitignored |

**Environment notes**: `pnpm` is not installed natively in this environment (`pnpm --version` → "command not found"); `npx --yes pnpm@8` was used successfully as a substitute and is noted here for transparency. `corepack` is also unavailable. Node.js v26.3.0 and npm 11.16.0 are natively available. The task's specified filter name `oh-my-pm-mcp-server` does not match the actual package name `@oh-my-pm/mcp-server` in `packages/mcp-server/package.json` — this is flagged as a documentation/instruction-accuracy discrepancy, not a project defect, and the corrected filter was used to obtain real results rather than reporting a false failure.

---

## Appendix B — File/Area Checklist

| Area | Inspected | Notes |
| --- | --- | --- |
| README.md | Yes | Current, accurate, v1.0.0 badge correct |
| ROADMAP.md | Yes | Current, accurate, MCP section correctly present-tense |
| CHANGELOG.md | Yes (v1.0.0 and v0.13.0 entries read in full; earlier entries skimmed for structure) | Dense, well-organized, 14 version entries |
| AGENTS.md | Yes, full read | One stale line found (line 105) |
| CLAUDE.md | Yes, full read | Accurate adapter of AGENTS.md |
| install.json | Yes, full read | Accurate, consistent with installer behavior |
| VERSIONING.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md | Yes, full read | All accurate and current |
| docs/ (26 files) | Yes — all 26 read in full or by targeted section, split between direct reads and delegated sub-agent review | Findings in Sections 12, 14, 15 |
| tests/scenarios/, tests/golden/, tests/evaluation-rubric.md | Yes — delegated deep review, cross-checked against README table directly | Findings in Section 13 |
| scripts/ (all 10 files) | Yes — all run directly (validate-*, build-release) or read directly (check-links, generate-checksums, package-*) | All pass; version-check blind spot identified |
| installers/ (7 files) | Yes — all self-tests run directly; scripts read for behavior detail via sub-agent + direct spot-check | Codex skill-copy overwrite bug found |
| packs/ (claude, cursor, codex, generic) | Yes — full delegated audit plus direct diff verification of key claims | Codex pack skill drift found and independently confirmed |
| chatgpt-skill/oh-my-pm/ | Yes — full delegated audit (SKILL.md, VERSION, openai.yaml, all 12 references) plus direct spot-checks | Findings in Section 8 |
| codex-skill/oh-my-pm/ | Yes — same as above, diffed against chatgpt-skill | Confirmed near-identical to chatgpt-skill |
| .cursor/rules/ | Yes — read directly, diffed against packs/cursor copy | Byte-identical, confirmed |
| packages/mcp-server/ (src, tests, README, package.json) | Yes — architecture read directly; all 6 connector client.ts files read directly; full test suite run directly; delegated agent findings independently cross-verified | Findings in Sections 10-11 |
| GitHub, ClickUp, Airtable, Linear, Jira, Notion connector docs | Yes — all 6 read directly (headings, key sections) plus delegated deep review | Findings in Section 11 |
| release-readiness-v1.0.0.md, mcp.md, mcp-alpha-scope.md, mcp-interface-design.md, mcp-security-policy.md, mcp-connector-roadmap.md, security-model.md, architecture.md, compatibility.md, supported-tools.md | Yes, all read directly in full | Findings in Sections 7, 12, 15 |
| .github/ (workflows, templates) | Yes | Confirms tag-triggered auto-release; no attribution issues |
| _dev/ | Directory listing only (contents not read in depth — out of scope per task instructions, correctly gitignored) | Confirmed gitignored via `git check-ignore -v` |
| examples/, playbooks/, templates/, prompts/, glossary/ | Directory listing + spot checks | Consistent with validate-agent-files.sh's 100% pass on these areas |

---

## Appendix C — Suggested Issue Backlog

| Priority | Area | Issue | Why It Matters | Suggested Fix |
| --- | --- | --- | --- | --- |
| P0 | Pack system | `packs/codex/.agents/skills/oh-my-pm/references/*.md` are a stale draft (~4-5x thinner) vs. canonical `codex-skill/oh-my-pm/references/*.md`; nested `VERSION` reads `v0.1.0-alpha` | This is the actual content delivered to every Codex user via `install-codex.sh` — it materially under-delivers relative to the project's own stated content | Regenerate/replace the nested references from the canonical `codex-skill` copy; bump the nested VERSION; add a validator diff check |
| P0 | Documentation | `docs/faq.md:33` states MCP "is not available in the current version" | Directly false at v1.0.0; FAQ is a primary landing document for new users | Rewrite to present tense describing the 6 shipped connectors, matching `docs/mcp.md`'s already-correct framing |
| P1 | Agent contract | `AGENTS.md:105` calls MCP connectors "planned for future versions" | Inside the declared source-of-truth file; contradicts shipped reality | Remove or rewrite the MCP bullet in "What this is not" |
| P1 | Documentation | `docs/philosophy.md`, `docs/mcp-connector-roadmap.md:5`, `docs/mcp-security-policy.md:5`, `docs/mcp-interface-design.md:5` retain "planning document"/"future" framing | Violates the v1.0.0 release-readiness doc's own explicit criterion | Rewrite opening framing to present/historical tense, consistent with how `docs/mcp.md` was already updated |
| P1 | Documentation | `docs/compatibility.md` version table stops at v0.13.0; states install contract "may change before v1.0.0" | Contradicts the release-readiness doc's requirement that this table cover the full range through the current version | Add a v1.0.0 row; remove the "may change before v1.0.0" line |
| P1 | Installers | `install-codex.sh`'s skill-directory copy unconditionally overwrites regardless of `--force` | Inconsistent with the project's own "no destructive overwrite by default" rule; only installer action that behaves this way | Add existence/conflict check and gate on `--force`, matching the `AGENTS.md` copy behavior in the same script |
| P2 | Versioning | `agents/openai.yaml` version field stuck at `v0.1.0-alpha` in all 3 skill copies (chatgpt-skill, codex-skill, packs/codex) | Contradicts CHANGELOG's claimed full version-file lockstep at v1.0.0; currently low functional impact (`paths: {}`, unused metadata) | Bump to `v1.0.0` in all 3 locations; add to `validate-skill.sh` |
| P2 | Versioning | `packs/generic/AGENTS.md` prose footer reads `Version: v0.13.0` | Contradicts its own correct `VERSION` file; exactly the defect class release-readiness criteria explicitly call out | Update prose string; add a prose-version grep check to `validate-release.sh` |
| P2 | Versioning | Root `package.json` still reads `"version": "0.7.0"` | Stale, though low-impact (`private: true`, not part of pack lockstep) | Bump to `1.0.0` for consistency |
| P2 | Release engineering | `validate-release.sh`/`validate-agent-files.sh` do not check nested skill VERSION files or diff duplicate skill trees | Root cause of the P0 pack-drift defect going undetected across multiple releases | Add nested-VERSION check and a `diff -rq` gate between `codex-skill/` and `packs/codex/.agents/skills/` |
| P2 | Documentation | No dedicated troubleshooting document exists anywhere | Raises the support burden and barrier to entry for non-technical users hitting install conflicts or missing tokens | Add `docs/troubleshooting.md`; link from README and FAQ |
| P2 | Skill content | No end-to-end worked example exists in any of the 12 skill reference files | Weakens the skill's credibility as a source of standardized structured output | Add one full input→output example per reference file (Skill Professionalization v1.2) |
| P3 | Skill content | No retrospective/post-mortem reference file despite being a named AGENTS.md trigger | Named capability with no backing depth | Add `references/retrospective.md` mirroring `playbooks/retrospective.md` |
| P3 | Bilingual | Only 2 of 12 skill reference files have a worked Persian contrastive example | Bilingual support is marketed as first-class but demonstrated narrowly | Add a domain-specific FA/EN example to the remaining 10 files (Skill Professionalization v1.4) |
| P3 | Scenario coverage | No negative/adversarial scenario; no pure-Persian marketing/product scenario | Evaluation rubric's "good failure" path and non-delivery-domain Persian quality are both untested | Add at least one adversarial scenario and one new-domain Persian scenario |
| P3 | Installer docs | `installers/verify-install.sh` top-of-file usage comment repeats `--target` where it should say `--scope` | Cosmetic, but misleading to a reader who doesn't run `--help` | Fix the header comment to match the actual `print_help()` output |
| P3 | MCP docs | `docs/mcp-alpha-scope.md:33`'s "If HTTP transport is added (v0.9.0+)" forward-reference is stale (v0.9.0 shipped ClickUp, not HTTP transport) | Minor but confusing to a reader trying to understand the transport roadmap | Update or remove the stale version forward-reference |
