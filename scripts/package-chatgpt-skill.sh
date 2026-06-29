#!/usr/bin/env sh
# Oh My PM — Package ChatGPT Skill
# Creates oh-my-pm-vX.Y.Z-chatgpt-skill.zip in dist/.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="$(cat "$REPO_ROOT/chatgpt-skill/oh-my-pm/VERSION" | tr -d '[:space:]')"
DIST_DIR="$REPO_ROOT/dist"
OUTPUT="$DIST_DIR/oh-my-pm-${VERSION}-chatgpt-skill.zip"

echo "Packaging ChatGPT Skill: $VERSION"
mkdir -p "$DIST_DIR"

cd "$REPO_ROOT"
zip -r "$OUTPUT" chatgpt-skill/oh-my-pm/ --quiet

echo "Created: $OUTPUT"
