#!/usr/bin/env sh
# Oh My PM — Install Cursor pack
# Copies .cursor/rules/*.mdc files into the target project.
# Usage: bash installers/install-cursor.sh [--dry-run] [--force] [--backup] [--target <dir>] [--self-test] [--version] [--help]

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACK_DIR="$REPO_ROOT/packs/cursor"
SOURCE_DIR="$PACK_DIR/.cursor/rules"
VERSION_FILE="$PACK_DIR/VERSION"

TARGET_DIR="$PWD"
DRY_RUN=0
FORCE=0
BACKUP=0
SELF_TEST=0

print_help() {
  cat <<EOF
Oh My PM — install-cursor

Installs Cursor rules (.cursor/rules/*.mdc) into a target project.

Usage:
  bash installers/install-cursor.sh [options]

Options:
  --dry-run       Preview actions without making changes
  --force         Replace existing rule files
  --backup        Create a timestamped backup before replacing (use with --force)
  --target DIR    Install into DIR instead of current directory
  --self-test     Verify script preconditions without modifying files
  --version       Print the pack version and exit
  --help          Show this help and exit

Notes:
  - Installs only missing files by default. Use --force to replace existing files.
  - --backup creates a backup at .backup-oh-my-pm-YYYYMMDD-HHMMSS/.cursor/rules/
  - No network calls are made. No credentials required.
  - Rollback: restore from the printed backup directory.
EOF
}

print_version() {
  if [ -f "$VERSION_FILE" ]; then cat "$VERSION_FILE"; else echo "unknown"; fi
}

run_self_test() {
  echo "Oh My PM — install-cursor self-test"
  _result=0
  _st() {
    if eval "$2" >/dev/null 2>&1; then echo "  PASS: $1"; else echo "  FAIL: $1"; _result=1; fi
  }
  _st "repo root is locatable"    "[ -d '$REPO_ROOT' ]"
  _st "pack directory exists"     "[ -d '$PACK_DIR' ]"
  _st "source rules dir exists"   "[ -d '$SOURCE_DIR' ]"
  _st "VERSION file exists"       "[ -f '$VERSION_FILE' ]"
  _st "at least one .mdc source"  "ls '$SOURCE_DIR'/*.mdc >/dev/null 2>&1"
  _st "script is readable"        "[ -r '$SCRIPT_DIR/install-cursor.sh' ]"
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

TARGET_RULES="$TARGET_DIR/.cursor/rules"
PACK_VERSION="$(print_version)"

echo "Oh My PM — install-cursor"
echo "Source:  $SOURCE_DIR"
echo "Target:  $TARGET_RULES"
echo "Version: $PACK_VERSION"
[ "$DRY_RUN" = "1" ] && echo "[dry-run] No changes will be made."

# Pre-flight checks
if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: Source directory not found: $SOURCE_DIR"
  echo "       Run this script from the oh-my-pm repository root."
  exit 1
fi
if [ ! -d "$TARGET_DIR" ]; then
  echo "ERROR: Target directory does not exist: $TARGET_DIR"; exit 1
fi

# Backup
if [ "$BACKUP" = "1" ] && [ "$FORCE" = "1" ] && [ -d "$TARGET_RULES" ]; then
  TIMESTAMP="$(date +%Y%m%d%H%M%S)"
  BACKUP_RULES="$TARGET_DIR/.backup-oh-my-pm-$TIMESTAMP/.cursor/rules"
  if [ "$DRY_RUN" = "0" ]; then
    mkdir -p "$BACKUP_RULES"
    cp "$TARGET_RULES"/*.mdc "$BACKUP_RULES/" 2>/dev/null || true
    echo "Backup:  $BACKUP_RULES"
    echo "Restore: cp '$BACKUP_RULES'/*.mdc '$TARGET_RULES/'"
  else
    echo "[dry-run] Would create backup: $BACKUP_RULES"
  fi
fi

if [ "$DRY_RUN" = "0" ]; then
  mkdir -p "$TARGET_RULES"
fi

for file in "$SOURCE_DIR"/*.mdc; do
  filename="$(basename "$file")"
  target_file="$TARGET_RULES/$filename"

  if [ -f "$target_file" ] && [ "$FORCE" = "0" ]; then
    echo "SKIP: $target_file already exists. Use --force to replace."
    continue
  fi

  if [ "$DRY_RUN" = "0" ]; then
    cp "$file" "$target_file"
    echo "Installed: $target_file"
  else
    echo "[dry-run] Would install: $target_file"
  fi
done

echo "Done."
