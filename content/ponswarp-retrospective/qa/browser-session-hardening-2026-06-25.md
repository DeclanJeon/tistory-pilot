# Browser Session Hardening — 2026-06-25

## 적용 내용
- `scripts/publish-ponslink-series.mjs`
  - `--visibility public|private`
  - `--restart-every N`
  - checkpoint JSONL append (`publish-results/*.checkpoint.jsonl`)
  - per-post health check (`probeOrigin`, `automation.probeEditor`)
  - poisoned session 에러 감지 후 브라우저 stop/start + 현재 포스트 1회 재시도
- `src/worker/agbrowse-automation.mjs`
  - `probeEditor()` 추가
  - 비공개 선택 후 `#publish-btn`가 `비공개 저장`으로 바뀌는지 대기하도록 보강
  - 발행 확인 단계에서 기대 버튼 텍스트를 받아 DOM 직접 클릭하도록 보강

## 검증 결과
- `node --check scripts/publish-ponslink-series.mjs`
- `node --check src/worker/agbrowse-automation.mjs`
- `node --check scripts/tistory-automation.mjs`
  - 모두 통과

## 라이브 재검증
- 배치 2026-06-24 / `post-39` 1건을 `--visibility private --restart-every 1`로 테스트
- 브라우저 health check / category ensure / editor probe 는 정상 통과
- 그러나 publish modal 에서
  - `visibilityResult.publishButtonText = "비공개 저장"`
  - 직후 `confirmPublishOnPage()` 관측값은 다시 `publishText = "공개 발행"`
- 결과적으로 모달이 닫히지 않고 저장 완료로 넘어가지 않음

## 현재 결론
- 브라우저 세션 오염 문제는 자동 재시작으로 완화됨
- 남은 문제는 티스토리 publish modal 내부 상태가 비공개 선택 직후 다시 공개 상태로 되돌아가는 UI 상태 문제임
- 다음 단계는 publish modal의 실제 라디오/폼 상태와 버튼 재렌더 트리거를 추가 추적하는 것
