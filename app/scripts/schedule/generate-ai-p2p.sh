#!/bin/bash
# generate-ai-p2p.sh — AI·P2P 트랙 일일 생성 배치 (뉴스 5 + 가이드 10 = 15건)
#
# 흐름: news-discovery(--topic both --category "AI·P2P" --cap 5)
#       → generate-post(--batch --category "AI·P2P" --news-cap 5 --count 15)
#       → auto-queue(--track aip2p)
# generate-daily.sh(legacy 트랙)와 같은 날짜 큐 파일을 공유한다 —
# auto-queue가 기존 큐 점유를 시딩하므로 슬롯 총 30을 넘지 않는다.
#
# 사용법:
#   bash scripts/schedule/generate-ai-p2p.sh           # 오늘분 생성 + 큐
#   bash scripts/schedule/generate-ai-p2p.sh --dry-run # 계획만 출력
# 수동 재생성이 필요할 때는 generate-post.mjs --batch --regenerate 를 직접 실행한다 —
# 발행 중복 게이트(원장 ID+제목)는 --regenerate 여도 항상 적용된다.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="/srv/publish-workbench/scheduled/logs"
DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN="--dry-run"; fi
if [ -w "$LOG_DIR" ]; then
  mkdir -p "$LOG_DIR"
  LOG_FILE="${LOG_DIR}/generate-ai-p2p-$(date +%Y-%m-%d).log"
  exec >> "$LOG_FILE" 2>&1
else
  echo "[log] ${LOG_DIR} 쓰기 불가 — 콘솔 모드 (local 실행)"
fi
echo ""
echo "===== $(date '+%Y-%m-%d %H:%M:%S') AI·P2P 트랙 생성 시작 ====="

cd "$APP_DIR"

DAILY_CAP="${DAILY_CAP:-15}"
NEWS_CAP="${NEWS_CAP:-5}"
TODAY="$(date +%Y-%m-%d)"

if [ -n "$DRY_RUN" ]; then
  echo "[mode] 드라이 런 (생성/큐 없음)"
fi

# [1] AI·P2P 뉴스 이슈 발굴 — P2P+AI 쿼리 합산, 암호화폐/금융 노이즈는 CRYPTO_NOISE_RE 차단
echo "[1] AI·P2P 뉴스 이슈 발굴 (cap ${NEWS_CAP})..."
if [ -z "$DRY_RUN" ]; then
  node scripts/content/news-discovery.mjs --date "$TODAY" --cap "$NEWS_CAP" --topic both --category "AI·P2P" --apply \
    || echo "  [warn] news-discovery 실패 — 계속 진행"
else
  node scripts/content/news-discovery.mjs --date "$TODAY" --cap "$NEWS_CAP" --topic both --category "AI·P2P" --dry-run 2>&1 | tail -40 \
    || echo "  [warn] news-discovery dry-run 실패"
fi

# [2] AI·P2P 키워드 생성 — 뉴스 ≤newsCap건 우선 + 가이드/기타로 count 채움
echo "[2] AI·P2P 키워드 ${DAILY_CAP}건 생성 시도 (뉴스 cap ${NEWS_CAP})..."
if [ -n "$DRY_RUN" ]; then
  node scripts/content/generate-post.mjs --list 2>&1 | grep -cE '^  ' \
    && echo "  (dry-run: 생성 생략)" || true
else
  node scripts/content/generate-post.mjs --batch --count "$DAILY_CAP" \
    --category "AI·P2P" --news-cap "$NEWS_CAP" 2>&1 | tail -300
fi

# [3] AI·P2P 트랙 큐 등록 — 믹스 게이트 생략(정보·기타 20% 상한과 상충), 트랙 캡 15
echo "[queue] AI·P2P 트랙 큐 등록..."
if [ -n "$DRY_RUN" ]; then
  node scripts/content/auto-queue.mjs --date "$TODAY" --track aip2p --dry-run 2>&1 | tail -40
else
  node scripts/content/auto-queue.mjs --date "$TODAY" --track aip2p 2>&1 | tail -40
fi

echo "===== $(date '+%Y-%m-%d %H:%M:%S') AI·P2P 트랙 생성 종료 ====="
exit 0
