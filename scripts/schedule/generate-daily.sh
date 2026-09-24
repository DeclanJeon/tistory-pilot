#!/bin/bash
# generate-daily.sh — 매일 자동 콘텐츠 생성 배치
#
# 핵심: generate-post --batch (QA 자동 게이트) → auto-queue (QA통과분만 큐잉)
# KEY가 없으면 generate가 전부 QA 실패로 끝나므로 발행은 안전하게 0건 유지.
#
# 사용법:
#   bash scripts/schedule/generate-daily.sh          # 오늘분 생성 + 큐
#   bash scripts/schedule/generate-daily.sh --dry-run # 계획만 출력
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="/srv/publish-workbench/scheduled/logs"
DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN="--dry-run"; fi
# 로컬(개발) 실행은 로그 파일을 못 쓸 수 있다 — 콘솔 모드로만 동작
if [ -w "$LOG_DIR" ]; then
  mkdir -p "$LOG_DIR"
  LOG_FILE="${LOG_DIR}/generate-$(date +%Y-%m-%d).log"
  exec >> "$LOG_FILE" 2>&1
else
  echo "[log] ${LOG_DIR} 쓰기 불가 — 콘솔 모드 (local 실행)"
fi
echo ""
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 콘텐츠 자동 생성 시작 ====="

cd "$APP_DIR"

if [ -n "$DRY_RUN" ]; then
  echo "[mode] 드라이 런 (생성/큐 없음)"
fi

# 0) 다중 소스 시장 수요 → 상업 키워드 발굴 (dry-run 기본, --apply에서만 등록)
#    Google Trends/KMA는 동적 관심사, Naver DataLab은 상대 검색 추세로
#    별도 보존한다. 수집 불가를 0건으로 가장하지 않는다.
DAILY_CAP="${DAILY_CAP:-15}"
MARKET_CAP="${MARKET_CAP:-5}"
if [ "$MARKET_CAP" -gt "$DAILY_CAP" ]; then MARKET_CAP="$DAILY_CAP"; fi
TODAY="$(date +%Y-%m-%d)"
MARKET_GENERATED=0
if [ -z "$DRY_RUN" ]; then
  echo "[0] 다중 소스 시장 키워드 분석 — 최대 ${MARKET_CAP}건 발굴..."
  if node scripts/content/market-discovery.mjs --date "$TODAY" --cap "$MARKET_CAP" --apply 2>&1 | tail -60; then
    SELECTED_FILE="content/learning/market-discovery-${TODAY}.selected.txt"
    if [ -f "$SELECTED_FILE" ]; then
      echo "[0] 시장 발굴 키워드 생성..."
      while IFS= read -r market_id; do
        [ -z "$market_id" ] && continue
        if node scripts/content/generate-post.mjs --keyword-id "$market_id" 2>&1 | tail -20; then
          MARKET_GENERATED=$((MARKET_GENERATED + 1))
        else
          echo "  ⚠ 시장 키워드 생성 실패: $market_id"
        fi
      done < "$SELECTED_FILE"
    fi
  else
    echo "  ⚠ 시장 키워드 분석 실패 — 기존 키워드 풀로만 진행"
  fi
else
  node scripts/content/market-discovery.mjs --date "$TODAY" --cap "$MARKET_CAP" --dry-run 2>&1 | tail -60 \
    || echo "  ⚠ dry-run 시장 키워드 분석 실패"
fi

# 기존 Google Trends 결과를 수동으로 재처리할 때는 trends-monetize.mjs를 사용한다.

# [0.5] Phase 1 Shadow: 다중 소스 + 실측 메트릭 비교 (발행 미반영, 실패해도 본 흐름 유지)
echo "[0.5] Shadow 다중 소스 + 실측 메트릭 리포트..."
if [ -z "$DRY_RUN" ]; then
  node scripts/content/shadow-run.mjs --date "$TODAY" 2>&1 | tail -30 \
    || echo "  ⚠ Shadow 수집 실패 — 본 발행 경로에는 영향 없음"
fi

# [0.6] Phase 4: 이벤트 트리거 감지 (Shadow, 발행 미반영)
echo "[0.6] 이벤트 트리거 감지..."
if [ -z "$DRY_RUN" ]; then
  node scripts/content/event-trigger.mjs --date "$TODAY" 2>&1 | tail -20 \
    || echo "  ⚠ 이벤트 감지 실패 — 본 발행 경로에는 영향 없음"
fi

# 1) 미발행 키워드 자동 생성 — QA 통과분만 남는다 (qa_failed는 스킵)
# 일일 캡에서 시장 발굴 생성분을 먼저 차감한다.
REMAIN_CAP=$((DAILY_CAP - MARKET_GENERATED))
[ "$REMAIN_CAP" -lt 0 ] && REMAIN_CAP=0
echo "[1] 미발행 키워드 ${REMAIN_CAP}건 생성 시도 (시장 발굴 ${MARKET_GENERATED}건 생성 완료)..."
if [ -n "$DRY_RUN" ]; then
  node scripts/content/generate-post.mjs --list 2>&1 | grep -cE '^  ' \
    && echo "  (dry-run: 생성 생략)" || true
else
  node scripts/content/generate-post.mjs --batch --count "$REMAIN_CAP" 2>&1 | tail -300
fi

# 2) 생성분을 오늘 큐로 등록 (QA 통과 + selectionScore + 믹스 + 캡)
echo "[queue] 오늘 생성분을 큐로 등록..."
if [ -n "$DRY_RUN" ]; then
  node scripts/content/auto-queue.mjs --date "$(date +%Y-%m-%d)" --dry-run 2>&1 | tail -30
else
  node scripts/content/auto-queue.mjs --date "$(date +%Y-%m-%d)" 2>&1 | tail -30
fi

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 콘텐츠 생성 종료 ====="
exit 0