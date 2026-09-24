#!/bin/bash
# queue-upload.sh — 로컬 큐 파일과 참조된 대표 이미지를 ponslink 서버로 업로드
#
# 사용법:
#   bash scripts/schedule/queue-upload.sh                    # 모든 큐 파일
#   bash scripts/schedule/queue-upload.sh 2026-07-28.json    # 특정 파일만
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_HOST="ponslink"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/publish-workbench}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-${REMOTE_ROOT}/app}"
LOCAL_QUEUE="${LOCAL_QUEUE:-${APP_DIR}/scheduled/queue}"
REMOTE_QUEUE="${REMOTE_QUEUE:-${REMOTE_ROOT}/scheduled/queue}"

if [ ! -d "$LOCAL_QUEUE" ]; then
  echo "큐 디렉토리가 없다: $LOCAL_QUEUE"
  exit 1
fi

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  shopt -s nullglob
  FILES=("$LOCAL_QUEUE"/*.json)
  shopt -u nullglob
else
  EXPANDED=()
  for f in "${FILES[@]}"; do
    if [ -f "$LOCAL_QUEUE/$f" ]; then
      EXPANDED+=("$LOCAL_QUEUE/$f")
    elif [ -f "$f" ]; then
      EXPANDED+=("$f")
    else
      echo "파일을 찾을 수 없다: $f"
      exit 1
    fi
  done
  FILES=("${EXPANDED[@]}")
fi

if [ ${#FILES[@]} -eq 0 ]; then
  echo "업로드할 큐 파일이 없다."
  exit 0
fi

declare -A UPLOADED_ASSETS=()

upload_asset() {
  local raw="$1"
  local rel local_path remote_path remote_dir
  [ -n "$raw" ] || return 0

  if [[ "$raw" = /* ]]; then
    case "$raw" in
      "$APP_DIR"/*)
        rel="${raw#"$APP_DIR/"}"
        local_path="$raw"
        ;;
      *)
        echo "프로젝트 밖 대표 이미지 경로는 업로드할 수 없다: $raw"
        return 1
        ;;
    esac
  else
    rel="${raw#./}"
    local_path="${APP_DIR}/${rel}"
  fi
  if [[ "$rel" == ".." || "$rel" == ../* || "$rel" == */../* ]]; then
    echo "프로젝트 밖으로 이탈하는 대표 이미지 경로: $raw"
    return 1
  fi
  if [ ! -f "$local_path" ]; then
    echo "대표 이미지 파일을 찾을 수 없다: $local_path"
    return 1
  fi
  if [ -n "${UPLOADED_ASSETS[$rel]+x}" ]; then return 0; fi

  remote_path="${REMOTE_APP_DIR}/${rel}"
  remote_dir="$(dirname "$remote_path")"
  ssh "$REMOTE_HOST" "mkdir -p -- '$remote_dir'"
  scp "$local_path" "${REMOTE_HOST}:${remote_path}"
  if [ -f "${local_path}.image.json" ]; then
    scp "${local_path}.image.json" "${REMOTE_HOST}:${remote_path}.image.json"
  fi
  UPLOADED_ASSETS["$rel"]=1
}

for file in "${FILES[@]}"; do
  echo "검사: $(basename "$file")"
  while IFS= read -r asset; do
    [ -n "$asset" ] || continue
    upload_asset "$asset"
  done < <(node --input-type=module -e 'import fs from "node:fs"; const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); for (const post of (data.posts || [])) if (post?.heroImage) console.log(post.heroImage);' "$file")
done

for file in "${FILES[@]}"; do
  filename=$(basename "$file")
  echo "업로드: $filename"
  scp "$file" "${REMOTE_HOST}:${REMOTE_QUEUE}/${filename}"
done

echo "업로드 완료 — ${#FILES[@]}건, 대표 이미지 ${#UPLOADED_ASSETS[@]}건"
