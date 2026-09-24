# post-28 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-28.txt`
- HTML: `content/ponswarp-retrospective/html/post-28.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-28/js-boundary-pressure.svg`
  - `content/ponswarp-retrospective/assets/post-28/wasm-js-fallback.svg`
  - `content/ponswarp-retrospective/assets/post-28/determinism-scope.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 post-20의 reordering buffer 판단을 이어받아, post-28의 질문을 “왜 WASM 경계로 옮겼나”로 좁힌다.
- 본문이 JS reordering의 자연스러운 출발점, 장기 경계의 문제, WASM으로 이동한 책임, JS fallback 유지 이유, 결정성/복잡도 변화, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- Season 3의 Rust/WASM 코어 분리 흐름 안에서 post-28 위치를 설명한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- Rust/WASM을 만능 해결책으로 과장하지 않고, JS fallback과 브라우저 저장 API 책임이 남아 있음을 명시한다.
- “JS가 느려서”라는 단순 설명을 피하고, 신뢰 계약과 책임 경계 이동으로 설명한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `4650d02` — 파일 깨짐 문제, 순차 쓰기, ReorderingBuffer 통합 흐름
  - `58e6b89` — 수신측 패킷 재정렬 버퍼를 WASM으로 마이그레이션한 분기점
- 코드/문서 앵커:
  - `PonsWarp/src/services/reorderingBuffer.ts:1-44`
  - `PonsWarp/src/services/reorderingBuffer.ts:53-118`
  - `PonsWarp/src/services/reorderingBuffer.ts:25-35`, `61-91`, `125-143`
  - `PonsWarp/src/services/wasmReorderingBuffer.ts:15-45`, `54-86`, `112-129`
  - `PonsWarp/src/services/directFileWriter.ts:90-104`, `704-706`, `995-1084`
  - `content/ponswarp-retrospective/series-plan.md:273-280`
  - `content/ponswarp-retrospective/evidence-index.md:79-86`, `163-167`
- 보수성:
  - WASM 이동을 실제 측정 성능 개선으로 단정하지 않음
  - “모든 재정렬이 Rust에서만 일어난다”고 쓰지 않고 JS fallback 유지 사실을 반영함
  - 브라우저 저장 API, UI 상태, resume hint는 JS 책임으로 남는다고 설명함

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
- DataChannel 도착 순서와 writer 저장 순서를 분리해 설명한다.
- WASM 이동을 복잡도 삭제가 아니라 결정적 byte-order 계약의 위치 조정으로 설명한다.
- fallback을 호환성 계약으로 해석해 브라우저 제품 맥락을 유지한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 SVG data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `js-boundary-pressure.svg`는 JS receiver 경계에 DataChannel 도착 순서, offset Map, writer 순서 책임이 모이는 압력을 설명한다.
- `wasm-js-fallback.svg`는 WASM 우선 초기화, ordered output, JS fallback 경로를 설명한다.
- `determinism-scope.svg`는 JS에 남는 브라우저 책임과 core로 내려간 결정적 reordering 책임을 나눠 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-28은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. reordering buffer의 WASM 이동을 속도 개선담으로 과장하지 않고, JS receiver에 모인 신뢰 책임을 packet/zero-copy/core 경계와 맞추려는 결정으로 정리한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
