# post-20 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-20.txt`
- HTML: `content/ponswarp-retrospective/html/post-20.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-20/out-of-order-arrival.svg`
  - `content/ponswarp-retrospective/assets/post-20/reordering-buffer-flow.svg`
  - `content/ponswarp-retrospective/assets/post-20/wasm-extraction-pressure.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 멀티 채널/네트워크 jitter 이후 out-of-order delivery가 제품 신뢰 문제가 되는 이유를 제시한다.
- 본문이 out-of-order 문제, ReorderingBuffer 해결 방식, 새 복잡도, Rust/WASM 경계, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-13의 멀티 채널 압력에서 Season 3의 Rust/WASM 코어 분리 주제로 이어지는 연결부를 제공한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- 재정렬 버퍼를 성능 만능 해법으로 과장하지 않고, 무결성 방어와 복잡도 증가를 함께 설명한다.
- Rust/WASM 전환도 마법 같은 해결책이 아니라 검증 가능한 core 책임으로 내려보내는 방향이라고 제한적으로 설명한다.

## 근거 QA

- 결과: PASS
- 코드 앵커:
  - `PonsWarp/src/services/reorderingBuffer.ts:1-44`
  - `PonsWarp/src/services/reorderingBuffer.ts:53-118`
  - `PonsWarp/src/services/reorderingBuffer.ts:25-35`, `61-91`, `125-143`
  - `PonsWarp/src/services/wasmReorderingBuffer.ts:15-45`, `54-86`, `112-129`
  - `PonsWarp/src/services/directFileWriter.ts:90-104`, `704-706`, `995-1084`
  - `content/ponswarp-retrospective/series-plan.md:137-148`, `208-215`, `273-280`
- 보수성:
  - DataChannel 자체가 무조건 out-of-order라고 쓰지 않고, 멀티 채널/네트워크 jitter/애플리케이션 writer 경계에서 순서 보장이 제품 문제가 된다고 제한했다.
  - WASM wrapper에 JS fallback이 남아 있음을 명시했다.
  - live publish evidence가 없으므로 publish readiness는 REVISE로 유지했다.

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 핵심 로직
  - 알고리즘
  - 제품 판단 변화
- out-of-order delivery가 사용자에게는 깨진 파일/완료 불신으로 보인다는 점을 설명한다.
- `nextExpectedOffset`, offset Map, fast path, buffered path, `drainBuffer()`의 역할을 설명한다.
- receiver-side backpressure와 pending bytes가 DataChannel queue와 별개로 중요하다는 점을 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `out-of-order-arrival.svg`는 sender offset 순서와 receiver 도착 순서가 어긋날 때 제품 신뢰 문제가 되는 흐름을 설명한다.
- `reordering-buffer-flow.svg`는 `push(chunk, offset)`, `nextExpectedOffset`, offset Map, ordered output 흐름을 설명한다.
- `wasm-extraction-pressure.svg`는 JS receiver 복잡도가 `pons-core-wasm`의 `reordering_buffer` 책임으로 이동하는 압력을 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-20은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. 재정렬 버퍼를 성능 최적화의 장식이 아니라 out-of-order delivery와 writer 순서 문제를 막는 무결성 장치로 설명하고, 그 비용이 메모리 상한, TTL, stale cleanup, fallback, 상태 관찰로 확장됐음을 문서화한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
