#!/usr/bin/env sh
# Oh My PM — Build release
# Validates, packages, and generates checksums for a release.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"
VERSION="$(cat "$REPO_ROOT/packs/claude/VERSION" | tr -d '[:space:]')"

echo "====================================="
echo "Oh My PM — build-release"
echo "Version: $VERSION"
echo "====================================="
echo ""

# Step 1: Clean dist but preserve .gitkeep
echo "--- Step 1: Clean dist/ ---"
find "$DIST_DIR" -type f ! -name ".gitkeep" -delete 2>/dev/null || true
echo "Cleaned dist/ (preserved .gitkeep)"
echo ""

# Step 2: Run validation
echo "--- Step 2: Validate agent files ---"
sh "$SCRIPT_DIR/validate-agent-files.sh"
echo ""

echo "--- Step 3: Validate skills ---"
sh "$SCRIPT_DIR/validate-skill.sh"
echo ""

echo "--- Step 4: Validate bilingual ---"
sh "$SCRIPT_DIR/validate-bilingual.sh"
echo ""

# Step 3: Package
echo "--- Step 5: Package ChatGPT Skill ---"
sh "$SCRIPT_DIR/package-chatgpt-skill.sh"
echo ""

echo "--- Step 6: Package Codex Skill ---"
sh "$SCRIPT_DIR/package-codex-skill.sh"
echo ""

echo "--- Step 7: Package agent packs ---"
sh "$SCRIPT_DIR/package-agent-packs.sh"
echo ""

# Step 4: Checksums
echo "--- Step 8: Generate checksums ---"
sh "$SCRIPT_DIR/generate-checksums.sh"
echo ""

# Step 5: Validation report
echo "--- Step 9: Generate validation report ---"
REPORT="$DIST_DIR/validation-report.md"
cat > "$REPORT" << REPORT_EOF
# Oh My PM — Validation Report

Version: $VERSION
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date)

## Assets

$(ls "$DIST_DIR"/*.zip 2>/dev/null | sed 's|.*/||' | sed 's/^/- /' || echo "No zip files found")

## Validation results

- validate-agent-files: PASS
- validate-skill: PASS
- validate-bilingual: PASS

## Notes

- This is an alpha release. Install contract may change before v1.0.0.
- MCP support is planned for v0.7.0 as a future optional integration layer.
REPORT_EOF
echo "Created: $REPORT"
echo ""

echo "====================================="
echo "Build complete."
echo "Assets in: $DIST_DIR"
echo "====================================="
echo ""
echo "IMPORTANT: Do not commit zip files or dist/ assets."
echo "           Only dist/.gitkeep should be committed."
