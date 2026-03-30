#!/bin/zsh
set -euo pipefail

SOURCE="/Users/jwiebe/Dropbox (Maestral)/Library/eBooks/Calibre/"
DEST="/Users/jwiebe/habitat-calibre/local-lib/"
LOCKDIR="/tmp/com.jwiebe.calibre-rsync.lock"
STAMP_FILE="/Users/jwiebe/habitat-calibre/local-lib/.last-synced-at"

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  exit 0
fi

cleanup() {
  rmdir "$LOCKDIR" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

/usr/bin/rsync -a --delete --human-readable \
  --exclude "metadata.db-shm" \
  --exclude "metadata.db-wal" \
  "$SOURCE" "$DEST"

/bin/date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_FILE"
