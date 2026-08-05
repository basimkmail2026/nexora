#!/usr/bin/env bash
set -euo pipefail
SOURCE_DIR="${1:-.}"
TARGET_DIR="${2:-$PWD}"
if [ ! -d "$SOURCE_DIR/apps" ]; then echo "Source folder must contain apps/"; exit 1; fi
rsync -a --delete --exclude .git --exclude node_modules "$SOURCE_DIR/" "$TARGET_DIR/"
cd "$TARGET_DIR"
git add -A
git commit -m "Reorganize Nexora Stage 6 stable" || true
git push
echo "Stable version uploaded. Render will redeploy automatically."
