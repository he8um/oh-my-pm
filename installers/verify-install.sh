#!/usr/bin/env sh
# Oh My PM — Verify installation
# Checks that Oh My PM is installed correctly in the target project.
# Usage: bash installers/verify-install.sh [--target <dir>]

set -e

TARGET_DIR="$PWD"

for arg in "$@"; do
  case "$arg" in
    --target) shift; TARGET_DIR="$1" ;;
  esac
done

PASS=0
FAIL=0

check() {
  label="$1"
  path="$2"
  if [ -e "$path" ]; then
    echo "PASS: $label — $path"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — $path not found"
    FAIL=$((FAIL + 1))
  fi
}

echo "Oh My PM — verify-install"
echo "Target: $TARGET_DIR"
echo ""

echo "--- Claude Code ---"
check "CLAUDE.md" "$TARGET_DIR/CLAUDE.md"

echo ""
echo "--- Cursor ---"
check ".cursor/rules dir" "$TARGET_DIR/.cursor/rules"
check "00-oh-my-pm-core.mdc" "$TARGET_DIR/.cursor/rules/00-oh-my-pm-core.mdc"
check "90-token-discipline.mdc" "$TARGET_DIR/.cursor/rules/90-token-discipline.mdc"

echo ""
echo "--- Codex ---"
check "AGENTS.md" "$TARGET_DIR/AGENTS.md"
check ".agents/skills/oh-my-pm" "$TARGET_DIR/.agents/skills/oh-my-pm"
check "skill SKILL.md" "$TARGET_DIR/.agents/skills/oh-my-pm/SKILL.md"
check "skill VERSION" "$TARGET_DIR/.agents/skills/oh-my-pm/VERSION"

echo ""
echo "--- No zip files installed ---"
if find "$TARGET_DIR" -maxdepth 2 -name "*.zip" | grep -q .; then
  echo "WARN: zip files found in target — these should not be installed"
  FAIL=$((FAIL + 1))
else
  echo "PASS: No zip files found"
  PASS=$((PASS + 1))
fi

echo ""
echo "--- Summary ---"
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "Some checks failed."
  exit 1
else
  echo "All checks passed."
fi
