# v1.0.0 Release Readiness

This document defines the exact criteria for promoting Oh My PM from its
current alpha release series (v0.1.0-alpha – v0.13.0) to `v1.0.0`.

This is a public project document. It is checked into the repository and
kept current as stabilization work proceeds.

---

## Purpose

Give a single, checkable definition of "done" for `v1.0.0` so that
promotion is a deliberate, auditable decision rather than an incremental
drift. Every criterion below must be satisfied, or explicitly waived with a
documented reason, before tagging `v1.0.0`.

---

## What v1.0.0 means

- The install contract (`install.json`, installer scripts, pack structure) will not change in a breaking way without a major version bump.
- `AGENTS.md` remains the single behavioral source of truth, and all tool adapters (`CLAUDE.md`, `.cursor/rules/*.mdc`, Skill files) are verified consistent with it.
- The MCP server's read-only guarantee is verified across all six shipped connectors (GitHub, ClickUp, Airtable, Linear, Jira, Notion).
- Documentation accurately reflects the current shipped state — no doc describes shipped functionality as "planned" or "future," and no doc claims unshipped functionality exists.
- The currently planned connector list is complete and this is stated explicitly in the roadmap docs.

## What v1.0.0 does not mean

- It does not mean new connectors are added. No new connector is in scope for v1.0.0.
- It does not mean write actions are introduced. The MCP server remains read-only-first at v1.0.0 and beyond, until a specific write action passes every condition in `docs/mcp-security-policy.md`.
- It does not mean the project is feature-complete forever — v1.0.0 is a stability commitment on the existing contract, not a feature freeze on future minor/major releases.
- It does not mean every possible edge case in every connector's target API has been tested against a live account — connector tests remain mock-based; each connector's documented limitations still apply.

---

## Stable install contract criteria

- [ ] `install.json` asset URLs and version field match the tagged release.
- [ ] All install scripts (`install-claude.sh`, `install-cursor.sh`, `install-codex.sh`) support `--dry-run`, `--force`, `--backup`, `--target`, `--self-test`, `--version`, `--help` consistently.
- [ ] All uninstall scripts (`uninstall-claude.sh`, `uninstall-cursor.sh`, `uninstall-codex.sh`) support `--dry-run`, `--force`, `--target`, `--self-test`, `--help` consistently. (`--version` is intentionally not implemented for uninstall scripts — there is nothing installed to report a version for, and reporting the pack's own version would be misleading. This is a documented design choice, not a gap.)
- [ ] `verify-install.sh` checks every file each installer actually copies (confirmed for `.cursor/rules/*.mdc` — all 9 rule files, not a subset).
- [ ] Upgrade behavior is documented: re-running install with `--force --backup` is the supported upgrade path.
- [ ] Rollback behavior is documented: restoring from the timestamped backup directory created by `--backup`.
- [ ] All six installer self-tests (`install-claude`, `install-cursor`, `install-codex`, `uninstall-claude`, `uninstall-cursor`, `uninstall-codex`) plus `verify-install.sh --help` pass.
- [ ] `scripts/build-release.sh` and `scripts/validate-release.sh` produce consistent, versioned output with no stale asset filenames.

## Stable pack contract criteria

- [ ] `packs/claude/VERSION`, `packs/cursor/VERSION`, `packs/codex/VERSION`, `packs/generic/VERSION`, `chatgpt-skill/oh-my-pm/VERSION`, `codex-skill/oh-my-pm/VERSION` are all identical and match the release version.
- [ ] No pack file contains a stale hardcoded version string in prose (README "Version:" lines, `CLAUDE.md`/`AGENTS.md` "Version:" footers, `SKILL.md` "Version:" footers).
- [ ] `.cursor/rules/*.mdc` files are byte-identical between the repository root (`.cursor/rules/`) and the installable pack (`packs/cursor/.cursor/rules/`) — Cursor rules are shared content, not tool-specific adaptations, so drift here is a bug.
- [ ] `AGENTS.md` remains the single behavioral source of truth. `CLAUDE.md`, pack `AGENTS.md`/`CLAUDE.md` files, and `.cursor/rules/*.mdc` are verified as adapters that do not introduce new or contradicting policy.
- [ ] No pack directory contains generated files (`node_modules/`, `dist/`, `.DS_Store`, build artifacts).
- [ ] Pack READMEs (where present) accurately describe pack contents and install steps.

## Stable MCP read-only contract criteria

- [ ] Every connector client (`packages/mcp-server/src/connectors/*/client.ts`) issues only `GET`, or a request-method restricted to specific, documented read-only paths (Linear's single GraphQL query endpoint; Notion's `/search` and `/databases/{id}/query`).
- [ ] No connector client exposes a generic, unrestricted `post()`/`put()`/`patch()`/`delete()` method.
- [ ] `packages/mcp-server/src/policy/read-only.ts` exports a read-only tool allowlist for all six connectors and `isReadOnlyTool()` checks all of them.
- [ ] No tool, resource, or prompt name across any connector suggests a write action.
- [ ] Tokens/credentials are never logged, never returned in tool output, never stored between restarts, for all six connectors.
- [ ] Missing token/config produces a graceful `degraded` or `error` response — the server never crashes on missing or invalid connector configuration.
- [ ] Rate-limit handling is present and consistent in shape (`rate_limited` error code with a retry hint) across connectors that support it.
- [ ] Pagination/list limits are bounded consistently (documented default and hard maximum per connector).
- [ ] Long text fields are truncated with a truncation marker, consistently, across connectors.
- [ ] All connector docs (`docs/github-connector.md`, `docs/clickup-connector.md`, `docs/airtable-connector.md`, `docs/linear-connector.md`, `docs/jira-connector.md`, `docs/notion-connector.md`) state their supported surfaces, unsupported surfaces, and known limitations accurately.

## Connector readiness criteria

- [ ] All six connectors (GitHub, ClickUp, Airtable, Linear, Jira, Notion) have passing unit tests with fully mocked HTTP/GraphQL responses — no live API calls in the test suite.
- [ ] `docs/mcp-connector-roadmap.md` explicitly states the currently planned connector list is complete, with no invented next-connector phase.
- [ ] No document references a version beyond `v1.0.0`, or an additional connector phase, as if it already exists or is scheduled.

## Security/privacy criteria

- [ ] No secrets, tokens, or realistic credential examples anywhere in the repository (source, docs, tests, fixtures).
- [ ] No private or internal company references anywhere in the repository.
- [ ] `docs/security-model.md` accurately describes the current (not "future") MCP security model.
- [ ] `docs/mcp-security-policy.md` accurately describes the current connector allowlist and least-privilege token guidance for all six connectors.
- [ ] No telemetry, no background network calls without an explicit tool invocation, verified across the MCP server and all installers.

## Bilingual quality criteria

- [ ] `validate-bilingual.sh` passes with no regressions.
- [ ] FA/EN term conventions in `.cursor/rules/70-bilingual-fa-en.mdc` are consistent between the repository root and the installable Cursor pack.
- [ ] Bilingual example outputs and golden outputs remain accurate and unmodified unless a behavioral change requires an update.

## Scenario/golden-output criteria

- [ ] `validate-agent-files.sh` and `validate-skill.sh` pass with no regressions.
- [ ] All existing scenario/golden-output pairs in `tests/scenarios/` and `tests/golden/` remain valid and unmodified unless a documented behavioral change requires an update.

## Release asset criteria

- [ ] `scripts/build-release.sh` produces all five packaged assets (ChatGPT Skill, Codex Skill, Claude pack, Cursor pack, generic agent pack) plus `checksums.txt` and `validation-report.md`, all correctly versioned.
- [ ] No zip files or other generated `dist/` assets are committed to the repository — only `dist/.gitkeep`.
- [ ] Checksums are generated fresh for the `v1.0.0` build and match the assets attached to the GitHub Release.

## Installer self-test criteria

- [ ] All six installer self-tests (`install-claude --self-test`, `install-cursor --self-test`, `install-codex --self-test`, `uninstall-claude --self-test`, `uninstall-cursor --self-test`, `uninstall-codex --self-test`) pass.
- [ ] `verify-install.sh --help` runs without error and documents `--scope` and `--target` correctly.

## Upgrade/rollback criteria

- [ ] Upgrading from any v0.x release to v1.0.0 via `install-*.sh --force --backup` does not lose user customizations without a backup.
- [ ] The backup directory naming and restore instructions are documented and consistent across all three install scripts.
- [ ] No install path breaks silently — every failure mode returns a clear, actionable error message.

## Documentation criteria

- [ ] No document describes shipped MCP functionality (local context tools, or any of the six connectors) as "planned," "future," or "will" — all such language is updated to present tense for shipped features.
- [ ] `docs/compatibility.md`'s version table covers the full release range through the current version, not just the earliest alpha.
- [ ] `README.md`'s version badge and any hardcoded release-asset filenames match the current tagged version.
- [ ] `ROADMAP.md` and `docs/mcp-connector-roadmap.md` mark all shipped work as "released," not "in progress" or "next," and both explicitly state that the currently planned connector list is complete.
- [ ] No internal contradiction between `docs/mcp.md`, `docs/architecture.md`, `docs/security-model.md`, and `packages/mcp-server/README.md` about what has shipped.

---

## Known limitations allowed at v1.0.0

These are accepted, documented limitations — they do not block v1.0.0:

- Connector tests are fully mocked; no connector has been validated against a live account as part of the automated test suite. This is intentional per `docs/mcp-security-policy.md` (no real API calls in tests).
- Each connector's documented per-connector limitations remain (see the individual connector docs) — for example, Jira's custom-field heuristic, Notion's first-level-only block fetching, Linear's deferred cycle data, Airtable's heuristic field-name matching.
- Uninstall scripts do not implement `--version` (see install contract criteria above — this is a deliberate design choice).
- The MCP server has no HTTP transport, only stdio — this was resolved as out-of-scope for the alpha in `docs/mcp-alpha-scope.md` and remains so at v1.0.0.
- No write action exists in any connector. This is the stated policy, not a gap to close.

## Blocking issues

As of this document's last update, no blocking issues are open. Any issue
discovered during stabilization that fails a criterion above and cannot be
immediately fixed must be listed here with an owner and a decision (fix
before v1.0.0, or explicitly waive with a documented reason) before tagging.

_None currently open._

## Manual QA checklist

Before tagging `v1.0.0`, manually verify:

- [ ] Fresh install of each pack (Claude, Cursor, Codex, generic) into a throwaway test project works as documented.
- [ ] `--dry-run` accurately previews changes for at least one installer without modifying anything.
- [ ] `--backup` produces a restorable backup for at least one installer.
- [ ] Uninstall removes exactly what was installed and nothing else.
- [ ] The MCP server starts via stdio transport with a Claude Code or Cursor client and responds to at least one local-context tool call.
- [ ] At least one connector tool call is exercised against a real account with a scoped read-only token, confirming the documented degraded/error responses behave as described when misconfigured (e.g., temporarily unset the token and confirm the degraded response).

## Release command checklist

1. Confirm no `v1.0.0` tag or release already exists.
2. Run all root validations (`validate-agent-files.sh`, `validate-skill.sh`, `validate-bilingual.sh`, `validate-release.sh`).
3. Run all installer self-tests and `verify-install.sh --help`.
4. Run MCP package checks (`typecheck`, `test`, `build`).
5. Run the read-only boundary, secret/token, and authorship/attribution scans.
6. Bump all VERSION files, `install.json`, and `packages/mcp-server/package.json` to `v1.0.0`.
7. Finalize `CHANGELOG.md` and mark `ROADMAP.md` v1.0.0 as released.
8. Run `scripts/build-release.sh` and confirm all assets are versioned correctly.
9. Commit release-prep changes with `git commit -m "chore: prepare v1.0.0 release"`.
10. Push `main`, then create and push an annotated `v1.0.0` tag.
11. Create or finalize the GitHub Release as a full (non-prerelease) release, since v1.0.0 signals contract stability.
12. Verify the release: correct tag, correct name, not a draft, all assets attached with checksums.

## Rollback plan

If a defect is discovered shortly after the `v1.0.0` tag:

- Do not delete or force-move the `v1.0.0` tag. Git tags are treated as immutable once pushed.
- Cut a `v1.0.1` patch release with the fix, following the same release process as prior patch releases.
- If the GitHub Release itself needs correction (wrong asset, wrong notes) before wide adoption, use `gh release edit` to correct metadata/notes, or `gh release upload --clobber` to replace an asset — do not delete and recreate the release.
- Document the incident in `CHANGELOG.md` under the patch release.

## Post-release verification checklist

- [ ] `gh release view v1.0.0` shows the correct tag, title, non-draft, and non-prerelease state.
- [ ] All expected assets are attached, including `checksums.txt` and `validation-report.md`.
- [ ] Downloading and verifying at least one asset's checksum against `checksums.txt` succeeds.
- [ ] `install.json` asset URLs resolve to the published release.
- [ ] A fresh clone of the repository at the `v1.0.0` tag passes all root validations without modification.

---

## Related docs

- `ROADMAP.md`
- `CHANGELOG.md`
- `docs/security-model.md`
- `docs/mcp-security-policy.md`
- `docs/mcp-connector-roadmap.md`
- `docs/compatibility.md`
- `VERSIONING.md`
