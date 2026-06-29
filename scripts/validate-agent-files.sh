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
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: validate-agent-files"
  exit 1
else
  echo "PASS: validate-agent-files"
fi
