#!/usr/bin/env sh
# Oh My PM — Install Cursor pack
# Copies .cursor/rules/*.mdc files into the target project.
# Usage: bash installers/install-cursor.sh [--dry-run] [--force] [--target <dir>]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/packs/cursor/.cursor/rules"

TARGET_DIR="$PWD"
DRY_RUN=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    --target)  shift; TARGET_DIR="$1" ;;
  esac
done

TARGET_RULES="$TARGET_DIR/.cursor/rules"

echo "Oh My PM — install-cursor"
echo "Source:  $SOURCE_DIR"
echo "Target:  $TARGET_RULES"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: Source directory not found: $SOURCE_DIR"
  exit 1
fi

if [ "$DRY_RUN" = "0" ]; then
  mkdir -p "$TARGET_RULES"
fi

for file in "$SOURCE_DIR"/*.mdc; do
  filename="$(basename "$file")"
  target_file="$TARGET_RULES/$filename"

  if [ -f "$target_file" ] && [ "$FORCE" = "0" ]; then
    echo "SKIP: $target_file already exists. Use --force to replace."
    continue
  fi

  if [ "$DRY_RUN" = "0" ]; then
    cp "$file" "$target_file"
    echo "Installed: $target_file"
  else
    echo "[dry-run] Would install: $target_file"
  fi
done

echo "Done."
