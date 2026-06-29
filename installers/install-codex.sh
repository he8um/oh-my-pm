#!/usr/bin/env sh
# Oh My PM — Install Codex pack
# Copies AGENTS.md and .agents/skills/oh-my-pm/ into the target project.
# Usage: bash installers/install-codex.sh [--dry-run] [--force] [--backup] [--target <dir>] [--self-test] [--version] [--help]

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACK_DIR="$REPO_ROOT/packs/codex"
SOURCE_AGENTS="$PACK_DIR/AGENTS.md"
SOURCE_SKILL="$PACK_DIR/.agents/skills/oh-my-pm"
VERSION_FILE="$PACK_DIR/VERSION"

TARGET_DIR="$PWD"
DRY_RUN=0
FORCE=0
BACKUP=0
SELF_TEST=0

print_help() {
  cat <<EOF
Oh My PM — install-codex

Installs the Codex pack (AGENTS.md + .agents/skills/oh-my-pm/) into a target project.

Usage:
  bash installers/install-codex.sh [options]

Options:
  --dry-run       Preview actions without making changes
  --force         Replace existing AGENTS.md and skill files
  --backup        Create a timestamped backup before replacing (use with --force)
  --target DIR    Install into DIR instead of current directory
  --self-test     Verify script preconditions without modifying files
  --version       Print the pack version and exit
  --help          Show this help and exit

Notes:
  - AGENTS.md is not overwritten by default (may contain user modifications).
  - --backup creates a backup at .backup-oh-my-pm-YYYYMMDD-HHMMSS/
  - No network calls are made. No credentials required.
  - Rollback: restore from the printed backup directory.
EOF
}

print_version() {
  if [ -f "$VERSION_FILE" ]; then cat "$VERSION_FILE"; else echo "unknown"; fi
}

run_self_test() {
  echo "Oh My PM — install-codex self-test"
  _result=0
  _st() {
    if eval "$2" >/dev/null 2>&1; then echo "  PASS: $1"; else echo "  FAIL: $1"; _result=1; fi
  }
  _st "repo root is locatable"    "[ -d '$REPO_ROOT' ]"
  _st "pack directory exists"     "[ -d '$PACK_DIR' ]"
  _st "source AGENTS.md exists"   "[ -f '$SOURCE_AGENTS' ]"
  _st "source skill dir exists"   "[ -d '$SOURCE_SKILL' ]"
  _st "VERSION file exists"       "[ -f '$VERSION_FILE' ]"
  _st "script is readable"        "[ -r '$SCRIPT_DIR/install-codex.sh' ]"
  if [ "$_result" = "0" ]; then echo "  PASS: self-test complete"
  else echo "  FAIL: self-test found issues — fix before installing"; fi
  return "$_result"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1 ;;
    --force)     FORCE=1 ;;
    --backup)    BACKUP=1 ;;
    --self-test) SELF_TEST=1 ;;
    --version)   print_version; exit 0 ;;
    --help)      print_help; exit 0 ;;
    --target)
      shift
      if [ $# -eq 0 ] || [ -z "$1" ]; then
        echo "ERROR: --target requires a directory argument"; exit 1
      fi
      TARGET_DIR="$1"
      ;;
    *)
      echo "ERROR: Unknown option: $1"
      echo "Run with --help for usage."
      exit 1
      ;;
  esac
  shift
done

if [ "$SELF_TEST" = "1" ]; then run_self_test; exit $?; fi

TARGET_AGENTS="$TARGET_DIR/AGENTS.md"
TARGET_SKILL="$TARGET_DIR/.agents/skills/oh-my-pm"
PACK_VERSION="$(print_version)"

echo "Oh My PM — install-codex"
echo "Version: $PACK_VERSION"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

# Pre-flight checks
if [ ! -f "$SOURCE_AGENTS" ]; then
  echo "ERROR: Source AGENTS.md not found: $SOURCE_AGENTS"
  echo "       Run this script from the oh-my-pm repository root."
  exit 1
fi
if [ ! -d "$SOURCE_SKILL" ]; then
  echo "ERROR: Source skill directory not found: $SOURCE_SKILL"; exit 1
fi
if [ ! -d "$TARGET_DIR" ]; then
  echo "ERROR: Target directory does not exist: $TARGET_DIR"; exit 1
fi
if [ ! -w "$TARGET_DIR" ]; then
  echo "ERROR: Target directory is not writable: $TARGET_DIR"; exit 1
fi

# Backup
if [ "$BACKUP" = "1" ] && [ "$FORCE" = "1" ]; then
  TIMESTAMP="$(date +%Y%m%d%H%M%S)"
  BACKUP_BASE="$TARGET_DIR/.backup-oh-my-pm-$TIMESTAMP"
  if [ "$DRY_RUN" = "0" ]; then
    mkdir -p "$BACKUP_BASE"
    [ -f "$TARGET_AGENTS" ] && cp "$TARGET_AGENTS" "$BACKUP_BASE/AGENTS.md" || true
    [ -d "$TARGET_SKILL" ] && cp -r "$TARGET_SKILL" "$BACKUP_BASE/" || true
    echo "Backup:  $BACKUP_BASE"
    echo "Restore AGENTS.md: cp '$BACKUP_BASE/AGENTS.md' '$TARGET_AGENTS'"
    echo "Restore skill:     cp -r '$BACKUP_BASE/oh-my-pm' '$TARGET_DIR/.agents/skills/'"
  else
    echo "[dry-run] Would create backup: $BACKUP_BASE"
  fi
fi

# Install AGENTS.md
if [ -f "$TARGET_AGENTS" ] && [ "$FORCE" = "0" ]; then
  echo ""
  echo "CONFLICT: $TARGET_AGENTS already exists."
  echo "  AGENTS.md may contain your customizations — it is not overwritten by default."
  echo "  To replace with backup:  bash installers/install-codex.sh --force --backup"
  echo "  To replace (no backup):  bash installers/install-codex.sh --force"
else
  if [ "$DRY_RUN" = "0" ]; then
    cp "$SOURCE_AGENTS" "$TARGET_AGENTS"
    echo "Installed: $TARGET_AGENTS"
  else
    echo "[dry-run] Would install: $TARGET_AGENTS"
  fi
fi

# Install skill
if [ "$DRY_RUN" = "0" ]; then
  mkdir -p "$TARGET_SKILL"
  cp -r "$SOURCE_SKILL/." "$TARGET_SKILL/"
  echo "Installed: $TARGET_SKILL"
else
  echo "[dry-run] Would install: $TARGET_SKILL"
fi

echo "Done."
