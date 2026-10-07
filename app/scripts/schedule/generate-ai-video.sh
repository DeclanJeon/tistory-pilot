#!/bin/bash
set -euo pipefail
APP_DIR="/srv/publish-workbench/app"
LOG_DIR="/srv/publish-workbench/scheduled/logs"
mkdir -p "$LOG_DIR"
DAY="$(TZ=Asia/Seoul date +%Y-%m-%d)"
exec >> "$LOG_DIR/generate-ai-video-$DAY.log" 2>&1
exec 9>/srv/publish-workbench/scheduled/ai-video-generation.lock
flock -n 9 || { echo '[ai-video] another production run owns the lane'; exit 0; }
echo "===== $(date -Is) AI 영상 제작 튜토리얼 시작 ====="
cd "$APP_DIR"
node scripts/content/generate-ai-video.mjs --enqueue
echo "===== $(date -Is) AI 영상 제작 튜토리얼 종료 ====="
