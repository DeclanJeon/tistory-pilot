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

# 0) Google 트렌드 → 수익형 키워드 발굴 (트렌드 우선 발행)
#    트렌드 키워드를 keywords.json에 등록한 뒤 먼저 생성한다. 생성 실패분은 다음 배치가 재시도.
DAILY_CAP="${DAILY_CAP:-15}"
TREND_CAP="${TREND_CAP:-5}"
TODAY="$(date +%Y-%m-%d)"
TREND_GENERATED=0
if [ -z "$DRY_RUN" ]; then
  echo "[0] Google 트렌드 분석 (KR) — 수익형 키워드 최대 ${TREND_CAP}건 발굴..."
  if node scripts/content/trends-fetch.mjs --date "$TODAY" 2>&1 | tail -20; then
    if node scripts/content/trends-monetize.mjs --date "$TODAY" --cap "$TREND_CAP" 2>&1 | tail -20; then
      if [ -f "content/trends/${TODAY}.selected.txt" ]; then
        echo "[0] 트렌드 키워드 생성..."
        while IFS= read -r trend_id; do
          [ -z "$trend_id" ] && continue
          if node scripts/content/generate-post.mjs --keyword-id "$trend_id" 2>&1 | tail -8; then
            TREND_GENERATED=$((TREND_GENERATED + 1))
          else
            echo "  ⚠ 트렌드 생성 실패: $trend_id"
          fi
        done < "content/trends/${TODAY}.selected.txt"
      fi
    fi
  else
    echo "  ⚠ 트렌드 수집 실패 — 기존 키워드 풀로만 진행"
  fi
fi

# 1) 미발행 키워드 자동 생성 — QA 통과분만 남는다 (qa_failed는 스킵)
# 15건 캡: 설계 문서 일일 상한 (트렌드 생성분 제외 나머지). 생성 실패분은 다음 배치가 재시도.
REMAIN_CAP=$((DAILY_CAP - TREND_GENERATED))
[ "$REMAIN_CAP" -lt 0 ] && REMAIN_CAP=0
echo "[1] 미발행 키워드 ${REMAIN_CAP}건 생성 시도 (트렌드 ${TREND_GENERATED}건 생성 완료)..."
if [ -n "$DRY_RUN" ]; then
  node scripts/content/generate-post.mjs --list 2>&1 | grep -cE '^  ' \
    && echo "  (dry-run: 생성 생략)" || true
else
  node scripts/content/generate-post.mjs --batch --count "$REMAIN_CAP" 2>&1 | tail -40
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