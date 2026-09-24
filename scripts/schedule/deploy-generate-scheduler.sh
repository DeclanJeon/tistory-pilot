#!/bin/bash
# deploy-generate-scheduler.sh — 콘텐츠 자동 생성 배치를 ponslink에 배포
#
# 실행:
#   bash scripts/schedule/deploy-generate-scheduler.sh
set -euo pipefail

REMOTE_HOST="ponslink"
REMOTE_ROOT="/srv/publish-workbench"
REMOTE_APP_DIR="${REMOTE_ROOT}/app"
REMOTE_DIR="${REMOTE_APP_DIR}/scripts/schedule"
REMOTE_SYSTEMD="/etc/systemd/system"

echo "=== 콘텐츠 생성 런타임 배포 시작 ==="

# 생성 배치가 참조하는 시장/이미지 런타임도 함께 배포한다. 스케줄러
# 스크립트만 올리면 원격 서버의 구버전 adapter가 남아 동적 수집이 멈춘다.
echo "시장/이미지 런타임 업로드..."
scp scripts/content/market-discovery.mjs scripts/content/market-research.mjs scripts/content/keyword-score.mjs scripts/content/trends-monetize.mjs scripts/content/generate-post.mjs scripts/content/qa-post.mjs scripts/content/auto-queue.mjs "${REMOTE_HOST}:${REMOTE_APP_DIR}/scripts/content/"
scp scripts/content/sources/aggregator.mjs scripts/content/sources/contract.mjs scripts/content/sources/google-trends.mjs scripts/content/sources/kma-weather.mjs scripts/content/sources/naver-datalab.mjs "${REMOTE_HOST}:${REMOTE_APP_DIR}/scripts/content/sources/"
scp src/core/media/image-acquisition.mjs "${REMOTE_HOST}:${REMOTE_APP_DIR}/src/core/media/"
scp src/core/source/extractor.mjs "${REMOTE_HOST}:${REMOTE_APP_DIR}/src/core/source/"

echo "스케줄러 스크립트 업로드..."
scp scripts/schedule/generate-daily.sh "${REMOTE_HOST}:${REMOTE_DIR}/"
scp scripts/schedule/queue-upload.sh "${REMOTE_HOST}:${REMOTE_DIR}/"
ssh "${REMOTE_HOST}" "chmod +x ${REMOTE_DIR}/generate-daily.sh"

# 2) systemd 단위 업로드 (root 권한 필요)
echo "systemd 단위 업로드..."
scp deploy/tistory-generate.service deploy/tistory-generate.timer "${REMOTE_HOST}:/tmp/"
ssh "${REMOTE_HOST}" "sudo cp /tmp/tistory-generate.service /tmp/tistory-generate.timer ${REMOTE_SYSTEMD}/ && rm -f /tmp/tistory-generate.service /tmp/tistory-generate.timer"

# 3) systemd 리로드 + 활성화
ssh "${REMOTE_HOST}" "sudo systemctl daemon-reload && sudo systemctl enable tistory-generate.timer && sudo systemctl start tistory-generate.timer && systemctl list-timers tistory-generate.timer --no-pager || true"

echo ""
echo "=== 배포 완료 ==="
echo ""
echo "사용법:"
echo "  # 수동 1회 실행"
echo "  ssh ponslink 'bash /srv/publish-workbench/app/scripts/schedule/generate-daily.sh'"
echo ""
echo "  # 로그 확인"
echo "  ssh ponslink 'cat /srv/publish-workbench/scheduled/logs/generate-\$(date +%Y-%m-%d).log'"
echo ""
echo "참고: LLM_API_KEY가 없으면 생성이 전부 QA 실패 → 발행 0건 (안전 잠금)"