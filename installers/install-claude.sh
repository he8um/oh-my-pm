#!/usr/bin/env sh
# Oh My PM — Install Claude Code pack
# Copies CLAUDE.md into the target project root.
# Usage: bash installers/install-claude.sh [--dry-run] [--force] [--backup] [--target <dir>] [--self-test] [--version] [--help]

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACK_DIR="$REPO_ROOT/packs/claude"
SOURCE="$PACK_DIR/CLAUDE.md"
VERSION_FILE="$PACK_DIR/VERSION"

TARGET_DIR="$PWD"
DRY_RUN=0
FORCE=0
BACKUP=0
SELF_TEST=0

print_help() {
  cat <<EOF
Oh My PM — install-claude

Installs the Claude Code pack (CLAUDE.md) into a target project.

Usage:
  bash installers/install-claude.sh [options]

Options:
  --dry-run       Preview actions without making changes
  --force         Replace existing CLAUDE.md
  --backup        Create a timestamped backup before replacing (use with --force)
  --target DIR    Install into DIR instead of current directory
  --self-test     Verify script preconditions without modifying files
  --version       Print the pack version and exit
  --help          Show this help and exit

Notes:
  - Does not overwrite existing files by default. Use --force to replace.
  - --backup creates a backup at .backup-oh-my-pm-YYYYMMDD-HHMMSS/CLAUDE.md
  - No network calls are made. No credentials required.
  - Rollback: if install fails after backup, restore from the printed backup path.
    Example: cp .backup-oh-my-pm-<timestamp>/CLAUDE.md <target>/CLAUDE.md
EOF
}

print_version() {
  if [ -f "$VERSION_FILE" ]; then cat "$VERSION_FILE"; else echo "unknown"; fi
}

run_self_test() {
  echo "Oh My PM — install-claude self-test"
  _result=0
  _st() {
    if eval "$2" >/dev/null 2>&1; then echo "  PASS: $1"; else echo "  FAIL: $1"; _result=1; fi
  }
  _st "repo root is locatable"  "[ -d '$REPO_ROOT' ]"
  _st "pack directory exists"   "[ -d '$PACK_DIR' ]"
  _st "source CLAUDE.md exists" "[ -f '$SOURCE' ]"
  _st "VERSION file exists"     "[ -f '$VERSION_FILE' ]"
  _st "script is readable"      "[ -r '$SCRIPT_DIR/install-claude.sh' ]"
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

TARGET="$TARGET_DIR/CLAUDE.md"
PACK_VERSION="$(print_version)"

echo "Oh My PM — install-claude"
echo "Source:  $SOURCE"
echo "Target:  $TARGET"
echo "Version: $PACK_VERSION"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

# Pre-flight checks
if [ ! -f "$SOURCE" ]; then
  echo "ERROR: Source file not found: $SOURCE"
  echo "       Run this script from the oh-my-pm repository root."
  exit 1
fi
if [ ! -d "$TARGET_DIR" ]; then
  echo "ERROR: Target directory does not exist: $TARGET_DIR"; exit 1
fi
if [ ! -w "$TARGET_DIR" ]; then
  echo "ERROR: Target directory is not writable: $TARGET_DIR"; exit 1
fi

# Conflict detection and upgrade logic
if [ -f "$TARGET" ]; then
  if [ "$FORCE" = "0" ]; then
    echo ""
    echo "CONFLICT: $TARGET already exists."
    echo "  To upgrade with backup:  bash installers/install-claude.sh --force --backup"
    echo "  To replace (no backup):  bash installers/install-claude.sh --force"
    echo "  To preview:              bash installers/install-claude.sh --dry-run"
    exit 0
  fi

  # Backup before replace
  if [ "$BACKUP" = "1" ]; then
    TIMESTAMP="$(date +%Y%m%d%H%M%S)"
    BACKUP_DIR="$TARGET_DIR/.backup-oh-my-pm-$TIMESTAMP"
    BACKUP_FILE="$BACKUP_DIR/CLAUDE.md"
    if [ "$DRY_RUN" = "0" ]; then
      mkdir -p "$BACKUP_DIR"
      cp "$TARGET" "$BACKUP_FILE"
      echo "Backup:  $BACKUP_FILE"
      echo "Restore: cp '$BACKUP_FILE' '$TARGET'"
    else
      echo "[dry-run] Would create backup: $BACKUP_FILE"
      echo "[dry-run] Restore: cp '<backup>/CLAUDE.md' '$TARGET'"
    fi
  fi
fi

# Install
if [ "$DRY_RUN" = "0" ]; then
  cp "$SOURCE" "$TARGET"
  echo "Installed: $TARGET"
else
  echo "[dry-run] Would install: $TARGET"
fi
