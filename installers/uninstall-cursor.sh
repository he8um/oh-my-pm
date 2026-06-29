#!/usr/bin/env sh
# Oh My PM — Uninstall Cursor pack
# Removes Oh My PM .mdc files from the target project.
# Usage: bash installers/uninstall-cursor.sh [--dry-run] [--target <dir>]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/packs/cursor/.cursor/rules"

TARGET_DIR="$PWD"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --target)  shift; TARGET_DIR="$1" ;;
  esac
done

TARGET_RULES="$TARGET_DIR/.cursor/rules"

echo "Oh My PM — uninstall-cursor"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

for file in "$SOURCE_DIR"/*.mdc; do
  filename="$(basename "$file")"
  target_file="$TARGET_RULES/$filename"

  if [ ! -f "$target_file" ]; then
    echo "SKIP: $target_file does not exist."
    continue
  fi

  if [ "$DRY_RUN" = "0" ]; then
    rm "$target_file"
    echo "Removed: $target_file"
  else
    echo "[dry-run] Would remove: $target_file"
  fi
done

echo "Done."
