#!/usr/bin/env sh
# Oh My PM — Install Claude Code pack
# Copies CLAUDE.md into the target project root.
# Usage: bash installers/install-claude.sh [--dry-run] [--force] [--backup] [--target <dir>]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$REPO_ROOT/packs/claude/CLAUDE.md"

TARGET_DIR="$PWD"
DRY_RUN=0
FORCE=0
BACKUP=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    --backup)  BACKUP=1 ;;
    --target)  shift; TARGET_DIR="$1" ;;
  esac
done

TARGET="$TARGET_DIR/CLAUDE.md"

echo "Oh My PM — install-claude"
echo "Source:  $SOURCE"
echo "Target:  $TARGET"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: Source file not found: $SOURCE"
  exit 1
fi

if [ -f "$TARGET" ]; then
  if [ "$FORCE" = "0" ]; then
    echo "SKIP: $TARGET already exists. Use --force to replace."
    exit 0
  fi
  if [ "$BACKUP" = "1" ]; then
    BACKUP_FILE="${TARGET}.backup.$(date +%Y%m%d%H%M%S)"
    if [ "$DRY_RUN" = "0" ]; then
      cp "$TARGET" "$BACKUP_FILE"
      echo "Backup:  $BACKUP_FILE"
    else
      echo "[dry-run] Would backup: $BACKUP_FILE"
    fi
  fi
fi

if [ "$DRY_RUN" = "0" ]; then
  cp "$SOURCE" "$TARGET"
  echo "Installed: $TARGET"
else
  echo "[dry-run] Would install: $TARGET"
fi
