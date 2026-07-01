#!/usr/bin/env sh
# Oh My PM — Validate agent files
# Checks that required agent and pack files exist and contain required content.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0

check_exists() {
  label="$1"
  path="$2"
  if [ -e "$REPO_ROOT/$path" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — $path not found"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  label="$1"
  path="$2"
  term="$3"
  if grep -q -e "$term" "$REPO_ROOT/$path" 2>/dev/null; then
    echo "PASS: $label contains '$term'"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — '$term' not found in $path"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== validate-agent-files ==="
echo ""

echo "--- Core agent files ---"
check_exists "AGENTS.md" "AGENTS.md"
check_exists "CLAUDE.md" "CLAUDE.md"

echo ""
echo "--- AGENTS.md required content ---"
check_contains "AGENTS.md: Head of Delivery" "AGENTS.md" "Head of Delivery"
check_contains "AGENTS.md: token discipline" "AGENTS.md" "token"
check_contains "AGENTS.md: bilingual" "AGENTS.md" "bilingual"
check_contains "AGENTS.md: project management" "AGENTS.md" "Project Management"
check_contains "AGENTS.md: software delivery" "AGENTS.md" "Software Delivery"
check_contains "AGENTS.md: marketing" "AGENTS.md" "Marketing"
check_contains "AGENTS.md: source of truth" "AGENTS.md" "source of truth"

echo ""
echo "--- CLAUDE.md required content ---"
check_contains "CLAUDE.md: references AGENTS.md" "CLAUDE.md" "AGENTS.md"
check_contains "CLAUDE.md: Head of Delivery" "CLAUDE.md" "Head of Delivery"

echo ""
echo "--- Cursor rules ---"
check_exists ".cursor/rules/00-oh-my-pm-core.mdc" ".cursor/rules/00-oh-my-pm-core.mdc"
check_exists ".cursor/rules/10-project-management.mdc" ".cursor/rules/10-project-management.mdc"
check_exists ".cursor/rules/20-delivery-management.mdc" ".cursor/rules/20-delivery-management.mdc"
check_exists ".cursor/rules/30-software-delivery.mdc" ".cursor/rules/30-software-delivery.mdc"
check_exists ".cursor/rules/40-marketing-ops.mdc" ".cursor/rules/40-marketing-ops.mdc"
check_exists ".cursor/rules/50-product-management.mdc" ".cursor/rules/50-product-management.mdc"
check_exists ".cursor/rules/60-product-marketing.mdc" ".cursor/rules/60-product-marketing.mdc"
check_exists ".cursor/rules/70-bilingual-fa-en.mdc" ".cursor/rules/70-bilingual-fa-en.mdc"
check_exists ".cursor/rules/90-token-discipline.mdc" ".cursor/rules/90-token-discipline.mdc"

echo ""
echo "--- Pack VERSION files ---"
check_exists "packs/claude/VERSION" "packs/claude/VERSION"
check_exists "packs/cursor/VERSION" "packs/cursor/VERSION"
check_exists "packs/codex/VERSION" "packs/codex/VERSION"
check_exists "packs/generic/VERSION" "packs/generic/VERSION"

echo ""
echo "--- Pack README files ---"
check_exists "packs/claude/README.md" "packs/claude/README.md"
check_exists "packs/cursor/README.md" "packs/cursor/README.md"
check_exists "packs/codex/README.md" "packs/codex/README.md"
check_exists "packs/generic/README.md" "packs/generic/README.md"

echo ""
echo "--- Installer scripts ---"
check_exists "installers/install-claude.sh"   "installers/install-claude.sh"
check_exists "installers/install-cursor.sh"   "installers/install-cursor.sh"
check_exists "installers/install-codex.sh"    "installers/install-codex.sh"
check_exists "installers/uninstall-claude.sh" "installers/uninstall-claude.sh"
check_exists "installers/uninstall-cursor.sh" "installers/uninstall-cursor.sh"
check_exists "installers/uninstall-codex.sh"  "installers/uninstall-codex.sh"
check_exists "installers/verify-install.sh"   "installers/verify-install.sh"

check_executable() {
  label="$1"; path="$2"
  if [ -x "$REPO_ROOT/$path" ]; then
    echo "PASS: $label is executable"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label is not executable — run: chmod +x $path"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "--- Installer executability ---"
check_executable "install-claude.sh"   "installers/install-claude.sh"
check_executable "install-cursor.sh"   "installers/install-cursor.sh"
check_executable "install-codex.sh"    "installers/install-codex.sh"
check_executable "uninstall-claude.sh" "installers/uninstall-claude.sh"
check_executable "uninstall-cursor.sh" "installers/uninstall-cursor.sh"
check_executable "uninstall-codex.sh"  "installers/uninstall-codex.sh"
check_executable "verify-install.sh"   "installers/verify-install.sh"

echo ""
echo "--- Installer flags (self-test and help) ---"
check_contains "install-claude.sh: --self-test"   "installers/install-claude.sh"   "--self-test"
check_contains "install-cursor.sh: --self-test"   "installers/install-cursor.sh"   "--self-test"
check_contains "install-codex.sh: --self-test"    "installers/install-codex.sh"    "--self-test"
check_contains "install-claude.sh: --help"        "installers/install-claude.sh"   "--help"
check_contains "install-cursor.sh: --backup"      "installers/install-cursor.sh"   "--backup"
check_contains "install-codex.sh: --backup"       "installers/install-codex.sh"    "--backup"

echo ""
echo "--- install.json ---"
check_exists "install.json" "install.json"

echo ""
echo "--- Scenario evaluation layer ---"
check_exists "tests/scenarios/README.md" "tests/scenarios/README.md"
check_exists "tests/evaluation-rubric.md" "tests/evaluation-rubric.md"

echo ""
echo "--- Scenario files ---"
check_exists "tests/scenarios/en-project-diagnosis.md" "tests/scenarios/en-project-diagnosis.md"
check_exists "tests/scenarios/fa-project-diagnosis.md" "tests/scenarios/fa-project-diagnosis.md"
check_exists "tests/scenarios/mixed-fa-en-repo-review.md" "tests/scenarios/mixed-fa-en-repo-review.md"
check_exists "tests/scenarios/software-prioritization.md" "tests/scenarios/software-prioritization.md"
check_exists "tests/scenarios/product-prd-review.md" "tests/scenarios/product-prd-review.md"
check_exists "tests/scenarios/marketing-launch-plan.md" "tests/scenarios/marketing-launch-plan.md"
check_exists "tests/scenarios/token-discipline.md" "tests/scenarios/token-discipline.md"

echo ""
echo "--- Golden outputs ---"
check_exists "tests/golden/en-project-diagnosis.output.md" "tests/golden/en-project-diagnosis.output.md"
check_exists "tests/golden/fa-project-diagnosis.output.md" "tests/golden/fa-project-diagnosis.output.md"
check_exists "tests/golden/mixed-delivery.output.md" "tests/golden/mixed-delivery.output.md"
check_exists "tests/golden/software-prioritization.output.md" "tests/golden/software-prioritization.output.md"
check_exists "tests/golden/product-prd-review.output.md" "tests/golden/product-prd-review.output.md"
check_exists "tests/golden/marketing-launch-plan.output.md" "tests/golden/marketing-launch-plan.output.md"
check_exists "tests/golden/token-discipline.output.md" "tests/golden/token-discipline.output.md"

echo ""
echo "--- Playbooks (Phase 5) ---"
check_exists "playbooks/project-intake.md" "playbooks/project-intake.md"
check_exists "playbooks/project-diagnosis.md" "playbooks/project-diagnosis.md"
check_exists "playbooks/scope-control.md" "playbooks/scope-control.md"
check_exists "playbooks/delivery-planning.md" "playbooks/delivery-planning.md"
check_exists "playbooks/backlog-prioritization.md" "playbooks/backlog-prioritization.md"
check_exists "playbooks/risk-review.md" "playbooks/risk-review.md"
check_exists "playbooks/prd-review.md" "playbooks/prd-review.md"
check_exists "playbooks/marketing-plan-review.md" "playbooks/marketing-plan-review.md"
check_exists "playbooks/launch-readiness.md" "playbooks/launch-readiness.md"
check_exists "playbooks/stakeholder-update.md" "playbooks/stakeholder-update.md"
check_exists "playbooks/retrospective.md" "playbooks/retrospective.md"
check_exists "playbooks/ai-agent-handoff.md" "playbooks/ai-agent-handoff.md"

echo ""
echo "--- Templates EN (Phase 5) ---"
check_exists "templates/en/project-brief.md" "templates/en/project-brief.md"
check_exists "templates/en/prd.md" "templates/en/prd.md"
check_exists "templates/en/roadmap.md" "templates/en/roadmap.md"
check_exists "templates/en/risk-register.md" "templates/en/risk-register.md"
check_exists "templates/en/decision-log.md" "templates/en/decision-log.md"
check_exists "templates/en/status-report.md" "templates/en/status-report.md"

echo ""
echo "--- Templates FA (Phase 5) ---"
check_exists "templates/fa/project-brief.md" "templates/fa/project-brief.md"
check_exists "templates/fa/prd.md" "templates/fa/prd.md"
check_exists "templates/fa/roadmap.md" "templates/fa/roadmap.md"
check_exists "templates/fa/risk-register.md" "templates/fa/risk-register.md"
check_exists "templates/fa/decision-log.md" "templates/fa/decision-log.md"
check_exists "templates/fa/status-report.md" "templates/fa/status-report.md"

echo ""
echo "--- Prompts EN (Phase 5) ---"
check_exists "prompts/en/diagnose-project.md" "prompts/en/diagnose-project.md"
check_exists "prompts/en/create-delivery-plan.md" "prompts/en/create-delivery-plan.md"
check_exists "prompts/en/create-next-agent-prompt.md" "prompts/en/create-next-agent-prompt.md"

echo ""
echo "--- Prompts FA (Phase 5) ---"
check_exists "prompts/fa/diagnose-project.md" "prompts/fa/diagnose-project.md"
check_exists "prompts/fa/create-delivery-plan.md" "prompts/fa/create-delivery-plan.md"
check_exists "prompts/fa/create-next-agent-prompt.md" "prompts/fa/create-next-agent-prompt.md"

echo ""
echo "--- Examples (Phase 5) ---"
check_exists "examples/software-project/output.en.md" "examples/software-project/output.en.md"
check_exists "examples/software-project/output.fa.md" "examples/software-project/output.fa.md"
check_exists "examples/marketing-project/output.en.md" "examples/marketing-project/output.en.md"
check_exists "examples/marketing-project/output.fa.md" "examples/marketing-project/output.fa.md"
check_exists "examples/product-project/output.en.md" "examples/product-project/output.en.md"
check_exists "examples/product-project/output.fa.md" "examples/product-project/output.fa.md"
check_exists "examples/mixed-delivery-project/output.en.md" "examples/mixed-delivery-project/output.en.md"
check_exists "examples/mixed-delivery-project/output.fa.md" "examples/mixed-delivery-project/output.fa.md"

echo ""
echo "--- MCP docs (Phase 6) ---"
check_exists "docs/mcp.md" "docs/mcp.md"
check_exists "docs/mcp-interface-design.md" "docs/mcp-interface-design.md"
check_exists "docs/mcp-security-policy.md" "docs/mcp-security-policy.md"
check_exists "docs/mcp-connector-roadmap.md" "docs/mcp-connector-roadmap.md"
check_contains "docs/architecture.md: MCP layer" "docs/architecture.md" "MCP layer"
check_contains "docs/security-model.md: read-only" "docs/security-model.md" "read-only"
check_contains "ROADMAP.md: v0.7.0" "ROADMAP.md" "v0.7.0"

echo ""
echo "--- MCP server alpha (Phase 7) ---"
check_exists "docs/mcp-alpha-scope.md" "docs/mcp-alpha-scope.md"
check_exists "packages/mcp-server/README.md" "packages/mcp-server/README.md"
check_exists "packages/mcp-server/package.json" "packages/mcp-server/package.json"
check_exists "packages/mcp-server/tsconfig.json" "packages/mcp-server/tsconfig.json"
check_exists "packages/mcp-server/src/index.ts" "packages/mcp-server/src/index.ts"
check_exists "packages/mcp-server/src/server.ts" "packages/mcp-server/src/server.ts"
check_exists "packages/mcp-server/src/policy/read-only.ts" "packages/mcp-server/src/policy/read-only.ts"
check_exists "packages/mcp-server/src/tools/inspect-project-context.ts" "packages/mcp-server/src/tools/inspect-project-context.ts"
check_exists "packages/mcp-server/src/tools/diagnose-project.ts" "packages/mcp-server/src/tools/diagnose-project.ts"
check_exists "packages/mcp-server/src/tools/prepare-agent-handoff.ts" "packages/mcp-server/src/tools/prepare-agent-handoff.ts"
check_exists "packages/mcp-server/src/tools/summarize-delivery-status.ts" "packages/mcp-server/src/tools/summarize-delivery-status.ts"
check_exists "packages/mcp-server/src/resources/registry.ts" "packages/mcp-server/src/resources/registry.ts"
check_exists "packages/mcp-server/src/prompts/registry.ts" "packages/mcp-server/src/prompts/registry.ts"
check_exists "packages/mcp-server/src/utils/safe-files.ts" "packages/mcp-server/src/utils/safe-files.ts"
check_exists "packages/mcp-server/tests/read-only-policy.test.ts" "packages/mcp-server/tests/read-only-policy.test.ts"
check_exists "packages/mcp-server/tests/tool-schemas.test.ts" "packages/mcp-server/tests/tool-schemas.test.ts"
check_exists "packages/mcp-server/tests/safe-files.test.ts" "packages/mcp-server/tests/safe-files.test.ts"
check_exists "packages/mcp-server/tests/bilingual-policy.test.ts" "packages/mcp-server/tests/bilingual-policy.test.ts"
check_contains "packages/mcp-server/src/policy/read-only.ts: isReadOnlyTool" "packages/mcp-server/src/policy/read-only.ts" "isReadOnlyTool"
check_contains "packages/mcp-server/package.json: build script" "packages/mcp-server/package.json" "tsc"
check_contains "packages/mcp-server/package.json: test script" "packages/mcp-server/package.json" "jest"

# Confirm no write tools exist in Phase 7 alpha
if grep -r "write\|create_task\|update_status\|delete_issue\|POST\|PUT\|PATCH\|DELETE" \
     "$REPO_ROOT/packages/mcp-server/src/tools/" 2>/dev/null | grep -v "^.*tsconfig\|comment\|//\|no write\|No write\|No mutations\|read-only\|write capability\|write action" | grep -q .; then
  echo "FAIL: packages/mcp-server/src/tools/ must not contain write actions in v0.7.0 alpha"
  FAIL=$((FAIL + 1))
else
  echo "PASS: packages/mcp-server/src/tools/ contains no write actions (correct for Phase 7 alpha)"
  PASS=$((PASS + 1))
fi

echo ""
echo "--- GitHub connector (Phase 8) ---"
check_exists "docs/github-connector.md" "docs/github-connector.md"
check_exists "packages/mcp-server/src/connectors/github/config.ts" "packages/mcp-server/src/connectors/github/config.ts"
check_exists "packages/mcp-server/src/connectors/github/client.ts" "packages/mcp-server/src/connectors/github/client.ts"
check_exists "packages/mcp-server/src/connectors/github/types.ts" "packages/mcp-server/src/connectors/github/types.ts"
check_exists "packages/mcp-server/src/connectors/github/errors.ts" "packages/mcp-server/src/connectors/github/errors.ts"
check_exists "packages/mcp-server/src/tools/github-list-issues.ts" "packages/mcp-server/src/tools/github-list-issues.ts"
check_exists "packages/mcp-server/src/tools/github-summarize-issue.ts" "packages/mcp-server/src/tools/github-summarize-issue.ts"
check_exists "packages/mcp-server/src/tools/github-list-milestones.ts" "packages/mcp-server/src/tools/github-list-milestones.ts"
check_exists "packages/mcp-server/src/tools/github-get-repository-context.ts" "packages/mcp-server/src/tools/github-get-repository-context.ts"
check_exists "packages/mcp-server/tests/github-config.test.ts" "packages/mcp-server/tests/github-config.test.ts"
check_exists "packages/mcp-server/tests/github-read-only-policy.test.ts" "packages/mcp-server/tests/github-read-only-policy.test.ts"
check_exists "packages/mcp-server/tests/github-tools.test.ts" "packages/mcp-server/tests/github-tools.test.ts"
check_contains "docs/github-connector.md: no write actions" "docs/github-connector.md" "No write actions"
check_contains "docs/github-connector.md: OH_MY_PM_GITHUB_TOKEN" "docs/github-connector.md" "OH_MY_PM_GITHUB_TOKEN"
check_contains "packages/mcp-server/src/connectors/github/config.ts: OH_MY_PM_GITHUB_TOKEN" "packages/mcp-server/src/connectors/github/config.ts" "OH_MY_PM_GITHUB_TOKEN"

# Confirm no GitHub write tool filenames exist
for write_tool in \
  "github-create-issue" "github-update-issue" "github-close-issue" \
  "github-create-comment" "github-add-label" "github-assign"; do
  if [ -f "$REPO_ROOT/packages/mcp-server/src/tools/${write_tool}.ts" ]; then
    echo "FAIL: write tool ${write_tool}.ts must not exist in Phase 8"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: no write tool ${write_tool}.ts (correct for Phase 8)"
    PASS=$((PASS + 1))
  fi
done

echo ""
echo "--- ClickUp connector (Phase 9) ---"
check_exists "docs/clickup-connector.md" "docs/clickup-connector.md"
check_exists "packages/mcp-server/src/connectors/clickup/config.ts" "packages/mcp-server/src/connectors/clickup/config.ts"
check_exists "packages/mcp-server/src/connectors/clickup/client.ts" "packages/mcp-server/src/connectors/clickup/client.ts"
check_exists "packages/mcp-server/src/connectors/clickup/types.ts" "packages/mcp-server/src/connectors/clickup/types.ts"
check_exists "packages/mcp-server/src/connectors/clickup/errors.ts" "packages/mcp-server/src/connectors/clickup/errors.ts"
check_exists "packages/mcp-server/src/tools/clickup-list-tasks.ts" "packages/mcp-server/src/tools/clickup-list-tasks.ts"
check_exists "packages/mcp-server/src/tools/clickup-summarize-task.ts" "packages/mcp-server/src/tools/clickup-summarize-task.ts"
check_exists "packages/mcp-server/src/tools/clickup-summarize-list-status.ts" "packages/mcp-server/src/tools/clickup-summarize-list-status.ts"
check_exists "packages/mcp-server/src/tools/clickup-list-spaces.ts" "packages/mcp-server/src/tools/clickup-list-spaces.ts"
check_exists "packages/mcp-server/tests/clickup-config.test.ts" "packages/mcp-server/tests/clickup-config.test.ts"
check_exists "packages/mcp-server/tests/clickup-read-only-policy.test.ts" "packages/mcp-server/tests/clickup-read-only-policy.test.ts"
check_exists "packages/mcp-server/tests/clickup-tools.test.ts" "packages/mcp-server/tests/clickup-tools.test.ts"
check_contains "docs/clickup-connector.md: no write actions" "docs/clickup-connector.md" "No write actions"
check_contains "docs/clickup-connector.md: OH_MY_PM_CLICKUP_TOKEN" "docs/clickup-connector.md" "OH_MY_PM_CLICKUP_TOKEN"
check_contains "packages/mcp-server/src/connectors/clickup/config.ts: OH_MY_PM_CLICKUP_TOKEN" "packages/mcp-server/src/connectors/clickup/config.ts" "OH_MY_PM_CLICKUP_TOKEN"

# Confirm no ClickUp write tool filenames exist
for write_tool in \
  "clickup-create-task" "clickup-update-task" "clickup-delete-task" \
  "clickup-create-comment" "clickup-change-status" "clickup-assign"; do
  if [ -f "$REPO_ROOT/packages/mcp-server/src/tools/${write_tool}.ts" ]; then
    echo "FAIL: write tool ${write_tool}.ts must not exist in Phase 9"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: no write tool ${write_tool}.ts (correct for Phase 9)"
    PASS=$((PASS + 1))
  fi
done

echo ""
echo "--- Airtable connector (Phase 10) ---"
check_exists "docs/airtable-connector.md" "docs/airtable-connector.md"
check_exists "packages/mcp-server/src/connectors/airtable/config.ts" "packages/mcp-server/src/connectors/airtable/config.ts"
check_exists "packages/mcp-server/src/connectors/airtable/client.ts" "packages/mcp-server/src/connectors/airtable/client.ts"
check_exists "packages/mcp-server/src/connectors/airtable/types.ts" "packages/mcp-server/src/connectors/airtable/types.ts"
check_exists "packages/mcp-server/src/connectors/airtable/errors.ts" "packages/mcp-server/src/connectors/airtable/errors.ts"
check_exists "packages/mcp-server/src/tools/airtable-list-bases.ts" "packages/mcp-server/src/tools/airtable-list-bases.ts"
check_exists "packages/mcp-server/src/tools/airtable-list-tables.ts" "packages/mcp-server/src/tools/airtable-list-tables.ts"
check_exists "packages/mcp-server/src/tools/airtable-describe-table.ts" "packages/mcp-server/src/tools/airtable-describe-table.ts"
check_exists "packages/mcp-server/src/tools/airtable-list-records.ts" "packages/mcp-server/src/tools/airtable-list-records.ts"
check_exists "packages/mcp-server/tests/airtable-config.test.ts" "packages/mcp-server/tests/airtable-config.test.ts"
check_exists "packages/mcp-server/tests/airtable-read-only-policy.test.ts" "packages/mcp-server/tests/airtable-read-only-policy.test.ts"
check_exists "packages/mcp-server/tests/airtable-tools.test.ts" "packages/mcp-server/tests/airtable-tools.test.ts"
check_contains "docs/airtable-connector.md: no write actions" "docs/airtable-connector.md" "No write actions"
check_contains "docs/airtable-connector.md: OH_MY_PM_AIRTABLE_TOKEN" "docs/airtable-connector.md" "OH_MY_PM_AIRTABLE_TOKEN"
check_contains "packages/mcp-server/src/connectors/airtable/config.ts: OH_MY_PM_AIRTABLE_TOKEN" "packages/mcp-server/src/connectors/airtable/config.ts" "OH_MY_PM_AIRTABLE_TOKEN"

# Confirm no Airtable write tool filenames exist
for write_tool in \
  "airtable-create-record" "airtable-update-record" "airtable-delete-record" \
  "airtable-create-table" "airtable-upload-attachment"; do
  if [ -f "$REPO_ROOT/packages/mcp-server/src/tools/${write_tool}.ts" ]; then
    echo "FAIL: write tool ${write_tool}.ts must not exist in Phase 10"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: no write tool ${write_tool}.ts (correct for Phase 10)"
    PASS=$((PASS + 1))
  fi
done

echo ""
echo "--- Linear connector (Phase 11) ---"
check_exists "docs/linear-connector.md" "docs/linear-connector.md"
check_exists "packages/mcp-server/src/connectors/linear/config.ts" "packages/mcp-server/src/connectors/linear/config.ts"
check_exists "packages/mcp-server/src/connectors/linear/client.ts" "packages/mcp-server/src/connectors/linear/client.ts"
check_exists "packages/mcp-server/src/connectors/linear/types.ts" "packages/mcp-server/src/connectors/linear/types.ts"
check_exists "packages/mcp-server/src/connectors/linear/errors.ts" "packages/mcp-server/src/connectors/linear/errors.ts"
check_exists "packages/mcp-server/src/tools/linear-list-issues.ts" "packages/mcp-server/src/tools/linear-list-issues.ts"
check_exists "packages/mcp-server/src/tools/linear-summarize-issue.ts" "packages/mcp-server/src/tools/linear-summarize-issue.ts"
check_exists "packages/mcp-server/src/tools/linear-summarize-project-status.ts" "packages/mcp-server/src/tools/linear-summarize-project-status.ts"
check_exists "packages/mcp-server/src/tools/linear-list-teams.ts" "packages/mcp-server/src/tools/linear-list-teams.ts"
check_exists "packages/mcp-server/src/tools/linear-list-projects.ts" "packages/mcp-server/src/tools/linear-list-projects.ts"
check_exists "packages/mcp-server/tests/linear-config.test.ts" "packages/mcp-server/tests/linear-config.test.ts"
check_exists "packages/mcp-server/tests/linear-read-only-policy.test.ts" "packages/mcp-server/tests/linear-read-only-policy.test.ts"
check_exists "packages/mcp-server/tests/linear-tools.test.ts" "packages/mcp-server/tests/linear-tools.test.ts"
check_contains "docs/linear-connector.md: no write actions" "docs/linear-connector.md" "No write actions"
check_contains "docs/linear-connector.md: OH_MY_PM_LINEAR_TOKEN" "docs/linear-connector.md" "OH_MY_PM_LINEAR_TOKEN"
check_contains "packages/mcp-server/src/connectors/linear/config.ts: OH_MY_PM_LINEAR_TOKEN" "packages/mcp-server/src/connectors/linear/config.ts" "OH_MY_PM_LINEAR_TOKEN"

# Confirm no Linear write tool filenames exist
for write_tool in \
  "linear-create-issue" "linear-update-issue" "linear-delete-issue" \
  "linear-create-comment" "linear-change-status" "linear-assign"; do
  if [ -f "$REPO_ROOT/packages/mcp-server/src/tools/${write_tool}.ts" ]; then
    echo "FAIL: write tool ${write_tool}.ts must not exist in Phase 11"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: no write tool ${write_tool}.ts (correct for Phase 11)"
    PASS=$((PASS + 1))
  fi
done

echo ""
echo "--- Jira connector (Phase 12) ---"
check_exists "docs/jira-connector.md" "docs/jira-connector.md"
check_exists "packages/mcp-server/src/connectors/jira/config.ts" "packages/mcp-server/src/connectors/jira/config.ts"
check_exists "packages/mcp-server/src/connectors/jira/client.ts" "packages/mcp-server/src/connectors/jira/client.ts"
check_exists "packages/mcp-server/src/connectors/jira/types.ts" "packages/mcp-server/src/connectors/jira/types.ts"
check_exists "packages/mcp-server/src/connectors/jira/errors.ts" "packages/mcp-server/src/connectors/jira/errors.ts"
check_exists "packages/mcp-server/src/tools/jira-list-issues.ts" "packages/mcp-server/src/tools/jira-list-issues.ts"
check_exists "packages/mcp-server/src/tools/jira-summarize-issue.ts" "packages/mcp-server/src/tools/jira-summarize-issue.ts"
check_exists "packages/mcp-server/src/tools/jira-summarize-project-status.ts" "packages/mcp-server/src/tools/jira-summarize-project-status.ts"
check_exists "packages/mcp-server/src/tools/jira-list-projects.ts" "packages/mcp-server/src/tools/jira-list-projects.ts"
check_exists "packages/mcp-server/src/tools/jira-list-boards.ts" "packages/mcp-server/src/tools/jira-list-boards.ts"
check_exists "packages/mcp-server/tests/jira-config.test.ts" "packages/mcp-server/tests/jira-config.test.ts"
check_exists "packages/mcp-server/tests/jira-read-only-policy.test.ts" "packages/mcp-server/tests/jira-read-only-policy.test.ts"
check_exists "packages/mcp-server/tests/jira-tools.test.ts" "packages/mcp-server/tests/jira-tools.test.ts"
check_contains "docs/jira-connector.md: no write actions" "docs/jira-connector.md" "No write actions"
check_contains "docs/jira-connector.md: OH_MY_PM_JIRA_TOKEN" "docs/jira-connector.md" "OH_MY_PM_JIRA_TOKEN"
check_contains "packages/mcp-server/src/connectors/jira/config.ts: OH_MY_PM_JIRA_TOKEN" "packages/mcp-server/src/connectors/jira/config.ts" "OH_MY_PM_JIRA_TOKEN"

# Confirm no Jira write tool filenames exist
for write_tool in \
  "jira-create-issue" "jira-update-issue" "jira-delete-issue" \
  "jira-transition-issue" "jira-create-comment" "jira-change-status"; do
  if [ -f "$REPO_ROOT/packages/mcp-server/src/tools/${write_tool}.ts" ]; then
    echo "FAIL: write tool ${write_tool}.ts must not exist in Phase 12"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: no write tool ${write_tool}.ts (correct for Phase 12)"
    PASS=$((PASS + 1))
  fi
done

echo ""
echo "--- Notion connector (Phase 13) ---"
check_exists "docs/notion-connector.md" "docs/notion-connector.md"
check_exists "packages/mcp-server/src/connectors/notion/config.ts" "packages/mcp-server/src/connectors/notion/config.ts"
check_exists "packages/mcp-server/src/connectors/notion/client.ts" "packages/mcp-server/src/connectors/notion/client.ts"
check_exists "packages/mcp-server/src/connectors/notion/types.ts" "packages/mcp-server/src/connectors/notion/types.ts"
check_exists "packages/mcp-server/src/connectors/notion/errors.ts" "packages/mcp-server/src/connectors/notion/errors.ts"
check_exists "packages/mcp-server/src/tools/notion-search-pages.ts" "packages/mcp-server/src/tools/notion-search-pages.ts"
check_exists "packages/mcp-server/src/tools/notion-summarize-page.ts" "packages/mcp-server/src/tools/notion-summarize-page.ts"
check_exists "packages/mcp-server/src/tools/notion-query-database.ts" "packages/mcp-server/src/tools/notion-query-database.ts"
check_exists "packages/mcp-server/src/tools/notion-summarize-database.ts" "packages/mcp-server/src/tools/notion-summarize-database.ts"
check_exists "packages/mcp-server/src/tools/notion-get-page-context.ts" "packages/mcp-server/src/tools/notion-get-page-context.ts"
check_exists "packages/mcp-server/tests/notion-config.test.ts" "packages/mcp-server/tests/notion-config.test.ts"
check_exists "packages/mcp-server/tests/notion-read-only-policy.test.ts" "packages/mcp-server/tests/notion-read-only-policy.test.ts"
check_exists "packages/mcp-server/tests/notion-tools.test.ts" "packages/mcp-server/tests/notion-tools.test.ts"
check_contains "docs/notion-connector.md: no write actions" "docs/notion-connector.md" "No write actions"
check_contains "docs/notion-connector.md: OH_MY_PM_NOTION_TOKEN" "docs/notion-connector.md" "OH_MY_PM_NOTION_TOKEN"
check_contains "packages/mcp-server/src/connectors/notion/config.ts: OH_MY_PM_NOTION_TOKEN" "packages/mcp-server/src/connectors/notion/config.ts" "OH_MY_PM_NOTION_TOKEN"

# Confirm no Notion write tool filenames exist
for write_tool in \
  "notion-create-page" "notion-update-page" "notion-delete-page" \
  "notion-append-block" "notion-create-database" "notion-create-comment"; do
  if [ -f "$REPO_ROOT/packages/mcp-server/src/tools/${write_tool}.ts" ]; then
    echo "FAIL: write tool ${write_tool}.ts must not exist in Phase 13"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: no write tool ${write_tool}.ts (correct for Phase 13)"
    PASS=$((PASS + 1))
  fi
done

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: validate-agent-files"
  exit 1
else
  echo "PASS: validate-agent-files"
fi
