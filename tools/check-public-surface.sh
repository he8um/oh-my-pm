#!/bin/sh

set -u

fail=0

err() {
  echo "FAIL: $1" >&2
  fail=1
}

if git ls-files | grep -q '^specs/'; then
  err "specs/ must not be tracked in the public repository"
fi

if git ls-files | grep -q '^_dev/'; then
  err "_dev/ must not be tracked"
fi

if git ls-files --error-unmatch _AGENT_OVERRIDE.md >/dev/null 2>&1; then
  err "_AGENT_OVERRIDE.md must not be tracked"
fi

if git check-ignore -q .gitignore 2>/dev/null; then
  err ".gitignore must not ignore itself"
fi

pattern='oh-my-pm-core|OH MY PM Core|implementation agent|AI-generated|Codex|Claude|ChatGPT|_AGENT_OVERRIDE|specs/[0-9][0-9]-|specs/INDEX|Required Documentation Pack|execution-grade specification|documentation pack'
files=$(git ls-files | grep -v -e '^tools/check-public-surface.sh$' -e '^tools/validate-boundaries.mjs$' -e '^\.gitignore$' || true)

if [ -n "$files" ]; then
  if printf '%s\n' "$files" | xargs grep -InE "$pattern" >/tmp/oh-my-pm-public-surface-grep.txt 2>/dev/null; then
    cat /tmp/oh-my-pm-public-surface-grep.txt >&2
    err "public files contain old repo name or private/internal language"
  fi
fi

rm -f /tmp/oh-my-pm-public-surface-grep.txt

if [ "$fail" -ne 0 ]; then
  echo "check-public-surface: FAILED" >&2
  exit 1
fi

echo "check-public-surface: OK"
