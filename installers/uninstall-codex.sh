#!/usr/bin/env sh
# Oh My PM — Uninstall Codex pack
# Removes Oh My PM skill from .agents/skills/oh-my-pm/.
# Does not remove AGENTS.md automatically (may contain user customizations).
# Usage: bash installers/uninstall-codex.sh [--dry-run] [--force] [--target <dir>] [--self-test] [--help]

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET_DIR="$PWD"
DRY_RUN=0
FORCE=0
SELF_TEST=0

print_help() {
  cat <<EOF
Oh My PM — uninstall-codex

Removes the Oh My PM Codex skill (.agents/skills/oh-my-pm/) from a target project.
Does not remove AGENTS.md — it may contain your customizations.

Usage:
  bash installers/uninstall-codex.sh [options]

Options:
  --dry-run       Preview what would be removed without making changes
  --force         Skip the confirmation prompt
  --target DIR    Uninstall from DIR instead of current directory
  --self-test     Verify script preconditions without modifying files
  --help          Show this help and exit

Notes:
  - AGENTS.md is never removed automatically. Remove it manually if needed.
  - Exits cleanly if the skill directory does not exist.
EOF
}

run_self_test() {
  echo "Oh My PM — uninstall-codex self-test"
  _result=0
  _st() {
    if eval "$2" >/dev/null 2>&1; then echo "  PASS: $1"; else echo "  FAIL: $1"; _result=1; fi
  }
  _st "repo root is locatable" "[ -d '$REPO_ROOT' ]"
  _st "script is readable"     "[ -r '$SCRIPT_DIR/uninstall-codex.sh' ]"
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

TARGET_SKILL="$TARGET_DIR/.agents/skills/oh-my-pm"

echo "Oh My PM — uninstall-codex"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

if [ ! -d "$TARGET_SKILL" ]; then
  echo "Nothing to uninstall: $TARGET_SKILL does not exist."
else
  echo "Will remove: $TARGET_SKILL"

  if [ "$FORCE" = "0" ] && [ "$DRY_RUN" = "0" ]; then
    printf "Proceed? [y/N] "
    read -r confirm
    case "$confirm" in
      [yY]) ;;
      *) echo "Cancelled."; exit 0 ;;
    esac
  fi

  if [ "$DRY_RUN" = "0" ]; then
    rm -rf "$TARGET_SKILL"
    echo "Removed: $TARGET_SKILL"
  else
    echo "[dry-run] Would remove: $TARGET_SKILL"
  fi
fi

AGENTS_FILE="$TARGET_DIR/AGENTS.md"
if [ -f "$AGENTS_FILE" ]; then
  echo ""
  echo "NOTE: $AGENTS_FILE was not removed."
  echo "      It may contain your customizations. Remove it manually if no longer needed."
fi

echo "Done."
