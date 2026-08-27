#!/bin/bash
# publish-queue.sh — 서버 cron에서 매일 실행, 큐 처리
#
# 역할:
#   1. 오늘 날짜의 큐 JSON을 읽음
#   2. submit-queue.mjs로 workbench API에 Job 생성
#   3. 결과를 로그에 기록
set -euo pipefail

APP_DIR="/srv/publish-workbench/app"
QUEUE_DIR="/srv/publish-workbench/scheduled/queue"
LOG_DIR="/srv/publish-workbench/scheduled/logs"
TODAY=$(date +%Y-%m-%d)
LOG_FILE="${LOG_DIR}/${TODAY}.log"

mkdir -p "$LOG_DIR"

exec >> "$LOG_FILE" 2>&1

echo ""
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 큐 처리 시작 ====="
echo ""

# --- 브라우저 health check + 자동 복구 ---
CDP_PORT="${CDP_PORT:-9230}"
CDP_URL="http://127.0.0.1:${CDP_PORT}/json/version"

ensure_browser() {
  echo "[browser] CDP port ${CDP_PORT} 확인 중..."
  if curl -s --connect-timeout 3 "$CDP_URL" > /dev/null 2>&1; then
    echo "[browser] CDP 응답 정상"
    return 0
  fi

  echo "[browser] CDP 응답 없음 — 브라우저 재시작 시도"
  export DISPLAY="${DISPLAY:-:99}"
  export CDP_PORT
  export BROWSER_AGENT_HOME="${BROWSER_AGENT_HOME:-/home/declan/browser-agent-workbench-clean}"

  # 기존 프로세스 정리
  "$APP_DIR/node_modules/.bin/agbrowse" stop 2>/dev/null || true
  sleep 2

  # 재시작
  "$APP_DIR/node_modules/.bin/agbrowse" start --headed 2>&1 | sed 's/^/  /'
  sleep 3

  if curl -s --connect-timeout 5 "$CDP_URL" > /dev/null 2>&1; then
    echo "[browser] 재시작 성공"
    return 0
  fi

  echo "[browser] 재시작 실패 — chromium 직접 실행 시도"
  # 최후의 수단: chromium을 직접 백그라운드에서 실행
  nohup /usr/bin/chromium-browser \
    --remote-debugging-port="$CDP_PORT" \
    --no-first-run \
    --disable-gpu \
    --no-sandbox \
    --user-data-dir="$BROWSER_AGENT_HOME/browser-profile" \
    > /dev/null 2>&1 &
  sleep 5

  if curl -s --connect-timeout 5 "$CDP_URL" > /dev/null 2>&1; then
    echo "[browser] chromium 직접 실행 성공"
    return 0
  fi

  echo "[browser] 브라우저 시작 완전 실패"
  return 1
}

ensure_browser
# 큐에 오늘 날짜 파일이 있는지 확인
QUEUE_FILE="${QUEUE_DIR}/${TODAY}.json"
if [ ! -f "$QUEUE_FILE" ]; then
  echo "오늘(${TODAY}) 큐 파일이 없다. 종료."
  exit 0
fi

echo "큐 파일: ${QUEUE_FILE}"

cd "$APP_DIR"
# Phase 4: due-aware — publishAt 이전 글만 제출 (15분 간격 타이머와 함께)
node scripts/schedule/submit-queue.mjs \
  --queue-dir "$QUEUE_DIR" \
  --date "$TODAY" \
  --due \
  --verbose

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "큐 처리 완료 — 성공"
else
  echo "큐 처리 완료 — 실패 (exit ${EXIT_CODE})"
fi

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 종료 ====="
