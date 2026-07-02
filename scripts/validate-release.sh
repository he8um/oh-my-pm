#!/usr/bin/env sh
# Oh My PM — Validate release
# Checks VERSION parity, dist assets, and that no zips are staged.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

EXPECTED_VERSION="v1.0.0"
PASS=0
FAIL=0

check_version() {
  label="$1"
  path="$2"
  if [ -f "$REPO_ROOT/$path" ]; then
    version="$(cat "$REPO_ROOT/$path" | tr -d '[:space:]')"
    if [ "$version" = "$EXPECTED_VERSION" ]; then
      echo "PASS: $label = $version"
      PASS=$((PASS + 1))
    else
      echo "FAIL: $label = '$version' (expected '$EXPECTED_VERSION')"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "FAIL: $label — $path not found"
    FAIL=$((FAIL + 1))
  fi
}

check_exists() {
  label="$1"
  path="$2"
  if [ -e "$REPO_ROOT/$path" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — $path not found"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  label="$1"
  path="$2"
  expected="$3"
  if [ -f "$REPO_ROOT/$path" ]; then
    if grep -qF "$expected" "$REPO_ROOT/$path"; then
      echo "PASS: $label"
      PASS=$((PASS + 1))
    else
      echo "FAIL: $label — expected to find '$expected' in $path"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "FAIL: $label — $path not found"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== validate-release ==="
echo ""

echo "--- VERSION parity ---"
check_version "chatgpt-skill VERSION" "chatgpt-skill/oh-my-pm/VERSION"
check_version "codex-skill VERSION" "codex-skill/oh-my-pm/VERSION"
check_version "packs/claude VERSION" "packs/claude/VERSION"
check_version "packs/cursor VERSION" "packs/cursor/VERSION"
check_version "packs/codex VERSION" "packs/codex/VERSION"
check_version "packs/generic VERSION" "packs/generic/VERSION"
check_version "packs/codex nested skill VERSION" "packs/codex/.agents/skills/oh-my-pm/VERSION"

echo ""
echo "--- Version metadata consistency ---"
EXPECTED_PKG_VERSION="$(echo "$EXPECTED_VERSION" | sed 's/^v//')"
check_contains "root package.json version" "package.json" "\"version\": \"$EXPECTED_PKG_VERSION\""
check_contains "chatgpt-skill openai.yaml version" "chatgpt-skill/oh-my-pm/agents/openai.yaml" "version: $EXPECTED_VERSION"
check_contains "codex-skill openai.yaml version" "codex-skill/oh-my-pm/agents/openai.yaml" "version: $EXPECTED_VERSION"
check_contains "packs/codex nested openai.yaml version" "packs/codex/.agents/skills/oh-my-pm/agents/openai.yaml" "version: $EXPECTED_VERSION"
check_contains "packs/generic AGENTS.md prose version" "packs/generic/AGENTS.md" "Version: $EXPECTED_VERSION"

echo ""
echo "--- dist assets (after build) ---"
check_exists "dist/.gitkeep" "dist/.gitkeep"

DIST_DIR="$REPO_ROOT/dist"
if [ -f "$DIST_DIR/checksums.txt" ]; then
  echo "PASS: dist/checksums.txt exists"
  PASS=$((PASS + 1))
else
  echo "NOTE: dist/checksums.txt not found (run build-release.sh first)"
fi

if [ -f "$DIST_DIR/validation-report.md" ]; then
  echo "PASS: dist/validation-report.md exists"
  PASS=$((PASS + 1))
else
  echo "NOTE: dist/validation-report.md not found (run build-release.sh first)"
fi

echo ""
echo "--- No staged zip files ---"
cd "$REPO_ROOT"
if git diff --cached --name-only 2>/dev/null | grep -q '\.zip$'; then
  echo "FAIL: Staged zip files detected — do not commit zip files"
  FAIL=$((FAIL + 1))
else
  echo "PASS: No staged zip files"
  PASS=$((PASS + 1))
fi

echo ""
echo "--- No staged dist assets (except .gitkeep) ---"
if git diff --cached --name-only 2>/dev/null | grep '^dist/' | grep -v '\.gitkeep$' | grep -q .; then
  echo "FAIL: Staged dist assets detected — only dist/.gitkeep should be committed"
  FAIL=$((FAIL + 1))
else
  echo "PASS: No staged dist assets (except .gitkeep allowed)"
  PASS=$((PASS + 1))
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: validate-release"
  exit 1
else
  echo "PASS: validate-release"
fi
