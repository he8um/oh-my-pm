#!/usr/bin/env sh
# Oh My PM — Package agent packs (Claude, Cursor, Codex, Generic)
# Creates zip files for each pack in dist/.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="$(cat "$REPO_ROOT/packs/claude/VERSION" | tr -d '[:space:]')"
DIST_DIR="$REPO_ROOT/dist"

echo "Packaging agent packs: $VERSION"
mkdir -p "$DIST_DIR"
cd "$REPO_ROOT"

zip -r "$DIST_DIR/oh-my-pm-${VERSION}-claude-pack.zip" packs/claude/ --quiet
echo "Created: $DIST_DIR/oh-my-pm-${VERSION}-claude-pack.zip"

zip -r "$DIST_DIR/oh-my-pm-${VERSION}-cursor-pack.zip" packs/cursor/ --quiet
echo "Created: $DIST_DIR/oh-my-pm-${VERSION}-cursor-pack.zip"

zip -r "$DIST_DIR/oh-my-pm-${VERSION}-generic-agent-pack.zip" packs/generic/ --quiet
echo "Created: $DIST_DIR/oh-my-pm-${VERSION}-generic-agent-pack.zip"

echo "Done."
