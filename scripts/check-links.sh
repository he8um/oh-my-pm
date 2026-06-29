#!/usr/bin/env sh
# Oh My PM — Check for broken internal markdown links (basic)
# Checks that files referenced in markdown links exist in the repo.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0

echo "=== check-links (internal markdown references) ==="
echo ""

# Check a known set of critical cross-file references
check_ref() {
  label="$1"
  path="$2"
  if [ -e "$REPO_ROOT/$path" ]; then
    echo "PASS: $label — $path"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — $path not found"
    FAIL=$((FAIL + 1))
  fi
}

check_ref "AGENTS.md" "AGENTS.md"
check_ref "CLAUDE.md" "CLAUDE.md"
check_ref "CHANGELOG.md" "CHANGELOG.md"
check_ref "ROADMAP.md" "ROADMAP.md"
check_ref "CONTRIBUTING.md" "CONTRIBUTING.md"
check_ref "SECURITY.md" "SECURITY.md"
check_ref "VERSIONING.md" "VERSIONING.md"
check_ref "LICENSE" "LICENSE"
check_ref "docs/overview.md" "docs/overview.md"
check_ref "docs/architecture.md" "docs/architecture.md"
check_ref "docs/mcp.md" "docs/mcp.md"
check_ref "docs/bilingual-support.md" "docs/bilingual-support.md"
check_ref "docs/installation.md" "docs/installation.md"
check_ref "glossary/fa-en.md" "glossary/fa-en.md"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: check-links"
  exit 1
else
  echo "PASS: check-links"
fi
