#!/usr/bin/env sh
# Oh My PM — Install Codex pack
# Copies AGENTS.md and .agents/skills/oh-my-pm/ into the target project.
# Usage: bash installers/install-codex.sh [--dry-run] [--force] [--target <dir>]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_AGENTS="$REPO_ROOT/packs/codex/AGENTS.md"
SOURCE_SKILL="$REPO_ROOT/packs/codex/.agents/skills/oh-my-pm"

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

TARGET_AGENTS="$TARGET_DIR/AGENTS.md"
TARGET_SKILL="$TARGET_DIR/.agents/skills/oh-my-pm"

echo "Oh My PM — install-codex"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

if [ -f "$TARGET_AGENTS" ] && [ "$FORCE" = "0" ]; then
  echo "SKIP: $TARGET_AGENTS already exists. Use --force to replace."
else
  if [ "$DRY_RUN" = "0" ]; then
    cp "$SOURCE_AGENTS" "$TARGET_AGENTS"
    echo "Installed: $TARGET_AGENTS"
  else
    echo "[dry-run] Would install: $TARGET_AGENTS"
  fi
fi

if [ "$DRY_RUN" = "0" ]; then
  mkdir -p "$TARGET_SKILL"
  cp -r "$SOURCE_SKILL/." "$TARGET_SKILL/"
  echo "Installed: $TARGET_SKILL"
else
  echo "[dry-run] Would install: $TARGET_SKILL"
fi

echo "Done."
