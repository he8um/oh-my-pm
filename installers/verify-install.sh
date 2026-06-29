#!/usr/bin/env sh
# Oh My PM — Verify installation
# Checks that Oh My PM is installed correctly in the target project.
# Usage: bash installers/verify-install.sh [--target <dir>] [--target <claude|cursor|codex|all>] [--help]

set -eu

TARGET_DIR="$PWD"
TARGET_SCOPE="all"

print_help() {
  cat <<EOF
Oh My PM — verify-install

Verifies that Oh My PM files are correctly installed in a target project.

Usage:
  bash installers/verify-install.sh [options]

Options:
  --target DIR          Verify installation in DIR (default: current directory)
  --scope claude        Verify Claude Code install only
  --scope cursor        Verify Cursor install only
  --scope codex         Verify Codex install only
  --scope all           Verify all install targets (default)
  --help                Show this help and exit

Exit codes:
  0   All checks passed
  1   One or more checks failed

Examples:
  bash installers/verify-install.sh
  bash installers/verify-install.sh --target ~/myproject
  bash installers/verify-install.sh --scope claude
  bash installers/verify-install.sh --scope cursor --target ~/myproject
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      shift
      if [ $# -eq 0 ] || [ -z "$1" ]; then
        echo "ERROR: --target requires a directory argument"; exit 1
      fi
      TARGET_DIR="$1"
      ;;
    --scope)
      shift
      if [ $# -eq 0 ] || [ -z "$1" ]; then
        echo "ERROR: --scope requires: claude, cursor, codex, or all"; exit 1
      fi
      TARGET_SCOPE="$1"
      case "$TARGET_SCOPE" in
        claude|cursor|codex|all) ;;
        *)
          echo "ERROR: Unknown scope '$TARGET_SCOPE'. Use: claude, cursor, codex, or all"
          exit 1
          ;;
      esac
      ;;
    --help) print_help; exit 0 ;;
    *)
      echo "ERROR: Unknown option: $1"
      echo "Run with --help for usage."
      exit 1
      ;;
  esac
  shift
done

PASS=0
FAIL=0

check() {
  label="$1"
  path="$2"
  if [ -e "$path" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — not found: $path"
    FAIL=$((FAIL + 1))
  fi
}

echo "Oh My PM — verify-install"
echo "Target:  $TARGET_DIR"
echo "Scope:   $TARGET_SCOPE"
echo ""

# Claude Code checks
if [ "$TARGET_SCOPE" = "claude" ] || [ "$TARGET_SCOPE" = "all" ]; then
  echo "--- Claude Code ---"
  check "CLAUDE.md present"  "$TARGET_DIR/CLAUDE.md"
  echo ""
fi

# Cursor checks
if [ "$TARGET_SCOPE" = "cursor" ] || [ "$TARGET_SCOPE" = "all" ]; then
  echo "--- Cursor ---"
  check ".cursor/rules directory"    "$TARGET_DIR/.cursor/rules"
  check "00-oh-my-pm-core.mdc"       "$TARGET_DIR/.cursor/rules/00-oh-my-pm-core.mdc"
  check "10-project-management.mdc"  "$TARGET_DIR/.cursor/rules/10-project-management.mdc"
  check "70-bilingual-fa-en.mdc"     "$TARGET_DIR/.cursor/rules/70-bilingual-fa-en.mdc"
  check "90-token-discipline.mdc"    "$TARGET_DIR/.cursor/rules/90-token-discipline.mdc"
  echo ""
fi

# Codex checks
if [ "$TARGET_SCOPE" = "codex" ] || [ "$TARGET_SCOPE" = "all" ]; then
  echo "--- Codex ---"
  check "AGENTS.md present"           "$TARGET_DIR/AGENTS.md"
  check ".agents/skills/oh-my-pm dir" "$TARGET_DIR/.agents/skills/oh-my-pm"
  check "skill SKILL.md"              "$TARGET_DIR/.agents/skills/oh-my-pm/SKILL.md"
  check "skill VERSION"               "$TARGET_DIR/.agents/skills/oh-my-pm/VERSION"
  echo ""
fi

# Sanity: no zips installed
echo "--- Sanity checks ---"
if find "$TARGET_DIR" -maxdepth 3 -name "*.zip" 2>/dev/null | grep -q .; then
  echo "WARN: zip files found in target — these should not be installed"
  FAIL=$((FAIL + 1))
else
  echo "PASS: No zip files installed"
  PASS=$((PASS + 1))
fi

echo ""
echo "--- Summary ---"
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: Some checks did not pass. Run the relevant installer and try again."
  exit 1
else
  echo "PASS: All checks passed."
fi
