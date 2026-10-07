#!/bin/bash
# publish-queue.sh — 15분 간격 타이머에서 실행, 큐 처리
#
# 역할:
#   1. 공개 표면 QA를 점검하고 지적이 있으면 Discord로 알림만 남긴다
#   2. 밀린(due) 글을 workbench API에 Job으로 제출
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

# Discord 알림에 쓸 웹훅만 환경으로 올린다. publish-queue.service에는
# EnvironmentFile이 없고, env 파일에는 비밀번호가 들어 있어 통째로
# source하면 특수문자 해석 사고가 날 수 있다. 필요한 두 키만 긁는다.
PW_ENV_FILE="/srv/publish-workbench/config/publish-workbench.env"
if [ -f "$PW_ENV_FILE" ]; then
  DISCORD_WEBHOOK_URL="$(grep -m1 '^DISCORD_WEBHOOK_URL=' "$PW_ENV_FILE" | cut -d= -f2-)"
  DISCORD_WEBHOOK_ENABLED="$(grep -m1 '^DISCORD_WEBHOOK_ENABLED=' "$PW_ENV_FILE" | cut -d= -f2-)"
  export DISCORD_WEBHOOK_URL DISCORD_WEBHOOK_ENABLED
fi

# 큐에 파일이 하나도 없을 때만 종료한다. 예전에는 "오늘 날짜 파일"만 봐서
# 오늘 큐가 아직 안 만들어진 날에는 과거 큐에 쌓인 밀린 글을 영구히
# 회수하지 못했다 (2026-09-16~25 백로그 17건이 그렇게 방치됐다).
if ! compgen -G "${QUEUE_DIR}/*.json" > /dev/null; then
  echo "큐 파일이 하나도 없다. 종료."
  exit 0
fi

cd "$APP_DIR"
echo "큐 파일 디렉토리: ${QUEUE_DIR}"

# 공개 표면 QA는 이제 경고일 뿐이다. 티스토리 스킨(webclub.tistory.com/354)이
# 모든 페이지 head에 <meta Refresh>와 출처 마커를 주입하기 때문에, 예전의
# --fail-on-blockers 는 어떤 글에서도 영구히 차단됐고 10일간 발행 Job이
# 0건이었다. 스키마/본문 지적은 Discord로 알리고 발행은 계속한다.
# 치명 코드(블로그 다운)로는 --fail-on-blockers 를 쓰지 않는다: 그 경우
# 제출해도 worker가 실패하므로 어차피 다음 tick에서 상태가 드러난다.
PUBLIC_QA_LIMIT="${PUBLIC_QA_ARTICLES:-10}"
set +e
node scripts/content/public-site-qa.mjs \
  --blog-url "${BLOG_URL:-https://acstory.tistory.com}" \
  --limit "$PUBLIC_QA_LIMIT" \
  --notify
QA_EXIT=$?
set -e
if [ "$QA_EXIT" -ne 0 ]; then
  echo "[public-qa] QA 실행 오류 (exit ${QA_EXIT}) — 발행은 계속한다."
else
  echo "[public-qa] QA 완료 — 발견 사항은 경고이며 발행을 중단하지 않는다."
fi

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
# Phase 4: due-aware — publishAt 이전 글만 제출 (15분 간격 타이머와 함께)
#
# --date 를 함께 넘기면 submit-queue.mjs 가 날짜 필터를 걸어 과거 큐 파일의
# 밀린 글을 영구히 회수하지 못한다. --due 만 넘겨 모든 날짜의 overdue 글을
# 회수하고, --limit 로 회수 속도를 제한한다 (worker는 2초마다 순차 처리라
# 한 번에 몰면 티스토리에 burst로 보인다).
EXIT_CODE=0
node scripts/schedule/submit-queue.mjs \
  --queue-dir "$QUEUE_DIR" \
  --due \
  --limit "${PUBLISH_QUEUE_BATCH:-4}" \
  --verbose \
  || EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "큐 처리 완료 — 성공"
else
  echo "큐 처리 완료 — 실패 (exit ${EXIT_CODE})"
fi

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 종료 ====="
exit "$EXIT_CODE"
