#!/usr/bin/env sh
# Oh My PM — Generate SHA-256 checksums for dist/ assets

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"
OUTPUT="$DIST_DIR/checksums.txt"

echo "Generating checksums..."

if ! ls "$DIST_DIR"/*.zip 2>/dev/null | grep -q .; then
  echo "No zip files found in dist/. Run build-release.sh first."
  exit 1
fi

> "$OUTPUT"

for f in "$DIST_DIR"/*.zip; do
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | sed "s|$DIST_DIR/||" >> "$OUTPUT"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | sed "s|$DIST_DIR/||" >> "$OUTPUT"
  else
    echo "ERROR: No sha256sum or shasum available"
    exit 1
  fi
done

echo "Checksums written to: $OUTPUT"
cat "$OUTPUT"
