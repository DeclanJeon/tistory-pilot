#!/bin/bash
# queue-upload.sh — 로컬 큐 파일을 ponslink 서버로 업로드
#
# 사용법:
#   bash scripts/schedule/queue-upload.sh                    # 모든 큐 파일
#   bash scripts/schedule/queue-upload.sh 2026-07-28.json    # 특정 파일만
set -euo pipefail

REMOTE_HOST="ponslink"
LOCAL_QUEUE="scheduled/queue"
REMOTE_QUEUE="/srv/publish-workbench/scheduled/queue"

if [ ! -d "$LOCAL_QUEUE" ]; then
  echo "큐 디렉토리가 없다: $LOCAL_QUEUE"
  exit 1
fi

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  FILES=($(ls "$LOCAL_QUEUE"/*.json 2>/dev/null || true))
else
  # 파일명만 전달된 경우 경로를 붙인다
  EXPANDED=()
  for f in "${FILES[@]}"; do
    if [ -f "$LOCAL_QUEUE/$f" ]; then
      EXPANDED+=("$LOCAL_QUEUE/$f")
    elif [ -f "$f" ]; then
      EXPANDED+=("$f")
    else
      echo "파일을 찾을 수 없다: $f"
      exit 1
    fi
  done
  FILES=("${EXPANDED[@]}")
fi

if [ ${#FILES[@]} -eq 0 ]; then
  echo "업로드할 큐 파일이 없다."
  exit 0
fi

for file in "${FILES[@]}"; do
  filename=$(basename "$file")
  echo "업로드: $filename"
  scp "$file" "${REMOTE_HOST}:${REMOTE_QUEUE}/${filename}"
done

echo "업로드 완료 — ${#FILES[@]}건"
