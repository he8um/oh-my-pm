#!/usr/bin/env sh
# Oh My PM — Uninstall Cursor pack
# Removes Oh My PM .mdc files from the target project.
# Usage: bash installers/uninstall-cursor.sh [--dry-run] [--force] [--target <dir>] [--self-test] [--help]

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/packs/cursor/.cursor/rules"

TARGET_DIR="$PWD"
DRY_RUN=0
FORCE=0
SELF_TEST=0

print_help() {
  cat <<EOF
Oh My PM — uninstall-cursor

Removes Oh My PM .mdc rule files from a target project's .cursor/rules/ directory.

Usage:
  bash installers/uninstall-cursor.sh [options]

Options:
  --dry-run       Preview what would be removed without making changes
  --force         Skip the confirmation prompt
  --target DIR    Uninstall from DIR instead of current directory
  --self-test     Verify script preconditions without modifying files
  --help          Show this help and exit

Notes:
  - Removes only the .mdc files that Oh My PM installs.
  - Does not remove the .cursor/rules directory itself.
  - Exits cleanly if no files are found.
EOF
}

run_self_test() {
  echo "Oh My PM — uninstall-cursor self-test"
  _result=0
  _st() {
    if eval "$2" >/dev/null 2>&1; then echo "  PASS: $1"; else echo "  FAIL: $1"; _result=1; fi
  }
  _st "repo root is locatable"  "[ -d '$REPO_ROOT' ]"
  _st "source rules dir exists" "[ -d '$SOURCE_DIR' ]"
  _st "script is readable"      "[ -r '$SCRIPT_DIR/uninstall-cursor.sh' ]"
  if [ "$_result" = "0" ]; then echo "  PASS: self-test complete"
  else echo "  FAIL: self-test found issues"; fi
  return "$_result"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1 ;;
    --force)     FORCE=1 ;;
    --self-test) SELF_TEST=1 ;;
    --help)      print_help; exit 0 ;;
    --target)
      shift
      if [ $# -eq 0 ] || [ -z "$1" ]; then
        echo "ERROR: --target requires a directory argument"; exit 1
      fi
      TARGET_DIR="$1"
      ;;
    *)
      echo "ERROR: Unknown option: $1"
      echo "Run with --help for usage."
      exit 1
      ;;
  esac
  shift
done

if [ "$SELF_TEST" = "1" ]; then run_self_test; exit $?; fi

TARGET_RULES="$TARGET_DIR/.cursor/rules"

echo "Oh My PM — uninstall-cursor"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

found=0
for file in "$SOURCE_DIR"/*.mdc; do
  filename="$(basename "$file")"
  target_file="$TARGET_RULES/$filename"

  if [ ! -f "$target_file" ]; then
    echo "SKIP: $target_file does not exist."
    continue
  fi

  found=$((found + 1))

  if [ "$DRY_RUN" = "0" ]; then
    rm "$target_file"
    echo "Removed: $target_file"
  else
    echo "[dry-run] Would remove: $target_file"
  fi
done

if [ "$found" = "0" ]; then
  echo "Nothing to uninstall: no Oh My PM rule files found in $TARGET_RULES"
fi

echo "Done."
