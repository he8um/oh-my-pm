#!/usr/bin/env sh
# Oh My PM — Validate skill files
# Checks that ChatGPT and Codex skill files exist and have required structure.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0

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
  term="$3"
  if grep -q "$term" "$REPO_ROOT/$path" 2>/dev/null; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — '$term' not found in $path"
    FAIL=$((FAIL + 1))
  fi
}

REFS="project-management.md delivery-management.md software-delivery.md marketing-ops.md product-management.md technical-product-management.md product-marketing.md prioritization.md risk-management.md stakeholder-communication.md token-efficiency.md bilingual-fa-en.md"

echo "=== validate-skill ==="
echo ""

for skill in chatgpt-skill codex-skill; do
  base="$skill/oh-my-pm"
  echo "--- $skill ---"
  check_exists "$base/SKILL.md" "$base/SKILL.md"
  check_exists "$base/VERSION" "$base/VERSION"
  check_exists "$base/agents/openai.yaml" "$base/agents/openai.yaml"

  check_contains "$base/SKILL.md: name oh-my-pm" "$base/SKILL.md" "name: oh-my-pm"
  check_contains "$base/SKILL.md: description not empty" "$base/SKILL.md" "head of delivery"
  check_contains "$base/SKILL.md: bilingual" "$base/SKILL.md" "bilingual"
  check_contains "$base/SKILL.md: trigger context" "$base/SKILL.md" "analyze a project"

  for ref in $REFS; do
    check_exists "$base/references/$ref" "$base/references/$ref"
  done
  echo ""
done

echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: validate-skill"
  exit 1
else
  echo "PASS: validate-skill"
fi
