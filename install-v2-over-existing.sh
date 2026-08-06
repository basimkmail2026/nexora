#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$HOME/Downloads/nexora-v1.5-stage6}"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$TARGET/.git" ]; then
  echo "Target Git repository not found: $TARGET"
  echo "Run: ./install-v2-over-existing.sh /path/to/your/current/nexora-repository"
  exit 1
fi

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='uploads' \
  "$SOURCE_DIR/" "$TARGET/"

cd "$TARGET"
git add -A
git commit -m "Upgrade Nexora 2.3 conversation experience" || true
git push

echo "Done. Render should deploy automatically."
