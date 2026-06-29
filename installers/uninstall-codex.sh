#!/usr/bin/env sh
# Oh My PM — Uninstall Codex pack
# Removes Oh My PM skill from .agents/skills/oh-my-pm/.
# Does not remove AGENTS.md automatically (may contain user customizations).
# Usage: bash installers/uninstall-codex.sh [--dry-run] [--target <dir>]

set -e

TARGET_DIR="$PWD"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --target)  shift; TARGET_DIR="$1" ;;
  esac
done

TARGET_SKILL="$TARGET_DIR/.agents/skills/oh-my-pm"

echo "Oh My PM — uninstall-codex"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

if [ -d "$TARGET_SKILL" ]; then
  if [ "$DRY_RUN" = "0" ]; then
    rm -rf "$TARGET_SKILL"
    echo "Removed: $TARGET_SKILL"
  else
    echo "[dry-run] Would remove: $TARGET_SKILL"
  fi
else
  echo "SKIP: $TARGET_SKILL does not exist."
fi

AGENTS_FILE="$TARGET_DIR/AGENTS.md"
if [ -f "$AGENTS_FILE" ]; then
  echo "NOTE: $AGENTS_FILE was not removed. It may contain your customizations."
  echo "      Remove it manually if you no longer need it."
fi

echo "Done."
