#!/bin/bash
# deploy-scheduler.sh — 스케줄러를 ponslink 서버에 배포
#
# 실행:
#   bash scripts/schedule/deploy-scheduler.sh
set -euo pipefail

REMOTE_HOST="ponslink"
REMOTE_DIR="/srv/publish-workbench/app/scripts/schedule"
REMOTE_SYSTEMD="/etc/systemd/system"

echo "=== 스케줄러 배포 시작 ==="

# 1) 스케줄 스크립트 업로드
echo "스크립트 업로드..."
scp scripts/schedule/submit-queue.mjs "${REMOTE_HOST}:${REMOTE_DIR}/"
scp scripts/schedule/queue-add.mjs "${REMOTE_HOST}:${REMOTE_DIR}/"
scp scripts/schedule/publish-queue.sh "${REMOTE_HOST}:${REMOTE_DIR}/"

# 2) 실행 권한
ssh "${REMOTE_HOST}" "chmod +x ${REMOTE_DIR}/publish-queue.sh"

# 3) systemd 파일 업로드
echo "systemd 파일 업로드..."
scp deploy/publish-queue.service "${REMOTE_HOST}:${REMOTE_SYSTEMD}/"
scp deploy/publish-queue.timer "${REMOTE_HOST}:${REMOTE_SYSTEMD}/"

# 4) systemd 리로드 + 활성화
echo "systemd 설정..."
ssh "${REMOTE_HOST}" "
  systemctl daemon-reload
  systemctl enable publish-queue.timer
  systemctl start publish-queue.timer
  echo '--- timer status ---'
  systemctl status publish-queue.timer --no-pager || true
"

echo ""
echo "=== 배포 완료 ==="
echo ""
echo "사용법:"
echo "  # 큐에 글 추가 (로컬)"
echo "  node scripts/schedule/queue-add.mjs --date 2026-07-28 --time 09:00 --title '제목' --body-file content/xxx.html"
echo ""
echo "  # 큐 확인 (서버)"
echo "  ssh ponslink 'ls /srv/publish-workbench/scheduled/queue/'"
echo ""
echo "  # 수동 실행 (서버)"
echo "  ssh ponslink 'cd /srv/publish-workbench/app && bash scripts/schedule/publish-queue.sh'"
echo ""
echo "  # 로그 확인"
echo "  ssh ponslink 'cat /srv/publish-workbench/scheduled/logs/\$(date +%Y-%m-%d).log'"
