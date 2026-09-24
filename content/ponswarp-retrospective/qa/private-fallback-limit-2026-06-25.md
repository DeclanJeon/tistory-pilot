# Private fallback limit — 2026-06-25

## 재현 명령
```bash
node scripts/publish-ponslink-series.mjs \
  --manifest content/ponswarp-retrospective/publish-manifest.batch-2026-06-25.json \
  --start-at 0 --count 1 \
  --visibility private \
  --restart-every 1 \
  --headless
```

## 확인 결과
- publish modal 자체는 비공개 상태로 정상 전환된다.
  - `visibilityResult.selectedText = "비공개"`
  - `visibilityResult.publishButtonText = "비공개 저장"`
- 직접 Playwright 재현에서도 버튼 텍스트는 클릭 전/후 모두 `비공개 저장`으로 유지된다.
- 실제 실패 원인은 브라우저 세션이 아니라 **티스토리 일일 작성 한도**다.

## 네트워크 증거
- `POST https://acstory.tistory.com/manage/post.json`
- 응답 `403`
- 응답 본문: `하루에 작성할 수 있는 글은 최대 50개까지입니다.`

## 결론
- private fallback 경로는 UI 측면에서는 동작한다.
- 현재는 일일 공개 한도(30개)와 별도로 **일일 작성 한도 50개**까지 이미 소진해서 더 이상 private draft도 오늘은 못 만든다.
- 다음 발행/저장은 날짜가 바뀐 뒤 재시도해야 한다.
