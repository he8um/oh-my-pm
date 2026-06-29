#!/usr/bin/env sh
# Oh My PM — Validate bilingual file parity
# Checks that FA/EN templates and prompts are paired and glossary exists.

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

echo "=== validate-bilingual ==="
echo ""

echo "--- Glossary ---"
check_exists "glossary/fa-en.md" "glossary/fa-en.md"

echo ""
echo "--- Template parity ---"
TEMPLATES="project-brief.md prd.md roadmap.md risk-register.md decision-log.md status-report.md"
for tmpl in $TEMPLATES; do
  check_exists "templates/en/$tmpl" "templates/en/$tmpl"
  check_exists "templates/fa/$tmpl" "templates/fa/$tmpl"
done

echo ""
echo "--- Prompt parity ---"
PROMPTS="diagnose-project.md create-delivery-plan.md create-next-agent-prompt.md"
for prompt in $PROMPTS; do
  check_exists "prompts/en/$prompt" "prompts/en/$prompt"
  check_exists "prompts/fa/$prompt" "prompts/fa/$prompt"
done

echo ""
echo "--- Bilingual docs ---"
check_exists "docs/bilingual-support.md" "docs/bilingual-support.md"

echo ""
echo "--- Mixed scenario ---"
check_exists "tests/scenarios/mixed-fa-en-repo-review.md" "tests/scenarios/mixed-fa-en-repo-review.md"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: validate-bilingual"
  exit 1
else
  echo "PASS: validate-bilingual"
fi
