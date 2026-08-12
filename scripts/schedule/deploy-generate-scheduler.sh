#!/bin/bash
# deploy-generate-scheduler.sh — 콘텐츠 자동 생성 배치를 ponslink에 배포
#
# 실행:
#   bash scripts/schedule/deploy-generate-scheduler.sh
set -euo pipefail

REMOTE_HOST="ponslink"
REMOTE_DIR="/srv/publish-workbench/app/scripts/schedule"
REMOTE_SYSTEMD="/etc/systemd/system"

echo "=== 콘텐츠 생성 스케줄러 배포 시작 ==="

# 1) 생성 배치 스크립트 업로드
echo "생성 배치 스크립트 업로드..."
scp scripts/schedule/generate-daily.sh "${REMOTE_HOST}:${REMOTE_DIR}/"
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