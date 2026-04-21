#!/usr/bin/env bash
# Build the Chrome Web Store submission zip.
#
# Outputs dist/local-serp-side-panel-<version>.zip containing only the files
# needed at runtime (no scripts/, git metadata, docs, dev-only icons, etc.).
set -euo pipefail

cd "$(dirname "$0")/.."

NAME="local-serp-side-panel"
VERSION=$(node -p "require('./manifest.json').version")
OUT_DIR="dist"
OUT="${OUT_DIR}/${NAME}-${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  background.js \
  sidepanel.html \
  sidepanel.js \
  sidepanel.css \
  content/ \
  lib/ \
  icons/ \
  LICENSE \
  -x "**/.DS_Store" "**/__pycache__/**"

echo ""
echo "Built: $OUT"
echo ""
echo "Contents:"
unzip -l "$OUT"
echo ""
echo "Size: $(du -h "$OUT" | cut -f1)"
