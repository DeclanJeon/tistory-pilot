#!/bin/bash
# test-daily-limit.sh — Tistory 일일 발행 제한 테스트
#
# 목적: 하루에 실제로 몇 건까지 발행할 수 있는지 확인
# 방법: 연속으로 빈 글을 발행하면서 제한 에러가 발생하는지 관찰
#
# 주의: 실제 글이 발행된다. 테스트 후 삭제 필요.
set -euo pipefail

BLOG_URL="https://acstory.tistory.com"
TEST_CATEGORY="IT·테크"
MAX_ATTEMPTS=20
CDP_PORT=9230

echo "=== Tistory 일일 발행 제한 테스트 ==="
echo "블로그: $BLOG_URL"
echo "최대 시도: $MAX_ATTEMPTS건"
echo ""

cd "$(dirname "$0")/.."

for i in $(seq 1 $MAX_ATTEMPTS); do
  TITLE="[테스트] 발행 제한 확인 $i — $(date +%H%M%S)"
  BODY="<p>발행 제한 테스트 #$i입니다. $(date)</p>"

  echo -n "[$i/$MAX_ATTEMPTS] 발행 시도: $TITLE ... "

  # tistory-automation으로 발행
  RESULT=$(node scripts/tistory-automation.mjs publish \
    --blog-url "$BLOG_URL" \
    --title "$TITLE" \
    --body "$BODY" \
    --category "$TEST_CATEGORY" \
    --headless \
    --yes 2>&1) || true

  # 결과 확인
  if echo "$RESULT" | grep -q "발행에 성공"; then
    echo "성공"
  elif echo "$RESULT" | grep -qi "limit\|제한\|하루\|daily\|too many"; then
    echo "제한 감지!"
    echo ""
    echo "=== 제한 도달 ==="
    echo "총 발행: $((i-1))건"
    echo "$RESULT" | tail -5
    exit 0
  elif echo "$RESULT" | grep -qi "error\|fail\|실패"; then
    echo "에러"
    echo "$RESULT" | tail -3
  else
    echo "확인 필요"
    echo "$RESULT" | tail -3
  fi

  # 5초 대기
  sleep 5
done

echo ""
echo "=== 테스트 완료 ==="
echo "$MAX_ATTEMPTS건까지 발행 제한 미감지"
echo "일일 제한은 $MAX_ATTEMPTS건 이상일 수 있다."
