#!/usr/bin/env sh
# Oh My PM — Uninstall Claude Code pack
# Removes CLAUDE.md from the target project root.
# Usage: bash installers/uninstall-claude.sh [--dry-run] [--force] [--target <dir>] [--self-test] [--help]

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET_DIR="$PWD"
DRY_RUN=0
FORCE=0
SELF_TEST=0

print_help() {
  cat <<EOF
Oh My PM — uninstall-claude

Removes CLAUDE.md installed by Oh My PM from a target project.

Usage:
  bash installers/uninstall-claude.sh [options]

Options:
  --dry-run       Preview what would be removed without making changes
  --force         Skip the confirmation prompt
  --target DIR    Uninstall from DIR instead of current directory
  --self-test     Verify script preconditions without modifying files
  --help          Show this help and exit

Notes:
  - Prompts for confirmation before removing (skipped with --force).
  - Exits cleanly if nothing is installed.
  - Does not remove backup directories.
EOF
}

run_self_test() {
  echo "Oh My PM — uninstall-claude self-test"
  _result=0
  _st() {
    if eval "$2" >/dev/null 2>&1; then echo "  PASS: $1"; else echo "  FAIL: $1"; _result=1; fi
  }
  _st "repo root is locatable" "[ -d '$REPO_ROOT' ]"
  _st "script is readable"     "[ -r '$SCRIPT_DIR/uninstall-claude.sh' ]"
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

TARGET="$TARGET_DIR/CLAUDE.md"

echo "Oh My PM — uninstall-claude"
echo "Target:  $TARGET"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

if [ ! -f "$TARGET" ]; then
  echo "Nothing to uninstall: $TARGET does not exist."
  exit 0
fi

echo "WARNING: This will remove $TARGET. It may contain your customizations."
echo "         Back it up first if you have made changes to it."

if [ "$FORCE" = "0" ] && [ "$DRY_RUN" = "0" ]; then
  printf "Proceed? [y/N] "
  read -r confirm
  case "$confirm" in
    [yY]) ;;
    *) echo "Cancelled."; exit 0 ;;
  esac
fi

if [ "$DRY_RUN" = "0" ]; then
  rm "$TARGET"
  echo "Removed: $TARGET"
else
  echo "[dry-run] Would remove: $TARGET"
fi
