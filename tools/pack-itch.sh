#!/bin/sh
# 打包成 itch.io 網頁遊戲用的 zip（index.html 要在 zip 的最上層）
#   sh tools/pack-itch.sh [輸出路徑]   預設 dist/chuang-world-web.zip
# 只放遊戲需要的檔案（不含測試、工具、報告、文件）。先跑 node tools/stamp-version.js。
set -e
cd "$(dirname "$0")/.."
OUT="${1:-dist/chuang-world-web.zip}"
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
zip -qr "$OUT" index.html styles.css app.js audio data engine i18n systems ui -x '*.DS_Store'
echo "已輸出 $OUT（$(du -h "$OUT" | cut -f1)）"
