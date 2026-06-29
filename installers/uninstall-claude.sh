#!/usr/bin/env sh
# Oh My PM — Uninstall Claude Code pack
# Removes CLAUDE.md from the target project root.
# Usage: bash installers/uninstall-claude.sh [--dry-run] [--target <dir>]

set -e

TARGET_DIR="$PWD"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --target)  shift; TARGET_DIR="$1" ;;
  esac
done

TARGET="$TARGET_DIR/CLAUDE.md"

echo "Oh My PM — uninstall-claude"
echo "Target:  $TARGET"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

if [ ! -f "$TARGET" ]; then
  echo "SKIP: $TARGET does not exist."
  exit 0
fi

echo "WARNING: This will remove $TARGET. It may contain your customizations."
echo "         If you have modified this file, back it up first."
printf "Proceed? [y/N] "
read -r confirm
case "$confirm" in
  [yY]) ;;
  *) echo "Cancelled."; exit 0 ;;
esac

if [ "$DRY_RUN" = "0" ]; then
  rm "$TARGET"
  echo "Removed: $TARGET"
else
  echo "[dry-run] Would remove: $TARGET"
fi
