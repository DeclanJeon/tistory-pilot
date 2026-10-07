#!/bin/bash
# run-hermes-prompt.sh — hermes 프롬프트 파일을 실행해서 HTML 출력
#
# 사용법:
#   bash scripts/content/run-hermes-prompt.sh content/generated/prompts/ETF-추천-초보-xxx.txt
#   bash scripts/content/run-hermes-prompt.sh --latest
set -euo pipefail

PROMPT_DIR="content/generated/prompts"
OUTPUT_DIR="content/generated/hermes-output"

mkdir -p "$OUTPUT_DIR"

if [ "${1:-}" = "--latest" ]; then
  PROMPT_FILE=$(ls -t "$PROMPT_DIR"/*.txt 2>/dev/null | head -1)
  if [ -z "$PROMPT_FILE" ]; then
    echo "프롬프트 파일이 없다: $PROMPT_DIR"
    exit 1
  fi
elif [ -n "${1:-}" ]; then
  PROMPT_FILE="$1"
else
  echo "사용법: $0 <프롬프트파일경로> | --latest"
  echo ""
  echo "사용 가능한 프롬프트:"
  ls -t "$PROMPT_DIR"/*.txt 2>/dev/null | head -10 || echo "  (없음)"
  exit 1
fi

BASENAME=$(basename "$PROMPT_FILE" .txt)
OUTPUT_FILE="$OUTPUT_DIR/${BASENAME}.html"

echo "프롬프트: $PROMPT_FILE"
echo "출력: $OUTPUT_FILE"
echo ""

# hermes 실행
hermes -z "$(cat "$PROMPT_FILE")" > "$OUTPUT_FILE" 2>/dev/null

if [ -s "$OUTPUT_FILE" ]; then
  SIZE=$(wc -c < "$OUTPUT_FILE")
  echo "생성 완료: $OUTPUT_FILE ($SIZE bytes)"
  echo ""
  echo "HTML 미리보기 (첫 5줄):"
  head -5 "$OUTPUT_FILE"
else
  echo "실패: 출력이 비어있다."
  echo "hermes auth가 필요할 수 있다: hermes auth login nous"
  rm -f "$OUTPUT_FILE"
  exit 1
fi
