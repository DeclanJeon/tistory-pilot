# post-26 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-26.txt`
- HTML: `content/ponswarp-retrospective/html/post-26.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-26/copy-boundaries.svg`
  - `content/ponswarp-retrospective/assets/post-26/wasm-pool-slots.svg`
  - `content/ponswarp-retrospective/assets/post-26/trust-boundary.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 zero-copy를 “복사 없음”이 아니라 “복사 경계 설계” 문제로 정의한다.
- 본문이 청크 풀링의 한계, WASM ZeroCopyPacketPool, zero-copy가 의미하지 않는 것, 메모리/신뢰 경계, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-15의 ChunkPool/DoubleBuffer 맥락을 Season 3의 WASM memory 경계와 신뢰 경계로 확장한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- zero-copy를 마케팅식 완성형으로 과장하지 않고, 줄어든 비용과 남은 복사를 구분한다.
- WebRTC detach, receiver 검증, backpressure를 성능 실패가 아니라 브라우저/WebRTC/WASM 소유권 경계로 설명한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `949d921 feat(perf): Phase 2 - 파이프라인 병렬화 + 이중 버퍼링 + 청크 풀링`
  - `db175bf`, `8aff234`, `4650d02`는 byteOffset/packet size/header parsing/file corruption 맥락 근거로 언급
- 코드 앵커:
  - `PonsWarp/workers/file-sender.worker.v2.ts at 949d921`
  - `PonsWarp/src/workers/file-sender.worker.ts:159-188`
  - `PonsWarp/src/workers/file-sender.worker.ts:801-865`
  - `pons-core-wasm/src/zero_copy_pool.rs:24-34`
  - `PonsWarp/src/workers/file-receiver.worker.ts:220-250`
  - `PonsWarp/src/services/directFileWriter.ts:47-104`, `1297-1490`
  - `PonsWarp/src/utils/constants.ts:18-29`
- 보수성:
  - 실제 throughput 수치나 측정 결과를 새로 만들지 않음
  - zero-copy가 모든 복사를 제거했다고 주장하지 않음
  - WASM이 브라우저/WebRTC/storage 경계를 지운다고 주장하지 않음

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
- sender 쪽 ChunkPool/ZeroCopyPacketPool과 receiver 쪽 packet verification, CRC32 fallback, DirectFileWriter finalize guard를 분리해 설명한다.
- 메모리 소유권 경계가 성능뿐 아니라 파일 신뢰와 완료 의미론에 영향을 준다는 trade-off를 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `copy-boundaries.svg`는 File slice, Worker, WASM memory, WebRTC send 사이의 복사/소유권 경계를 설명한다.
- `wasm-pool-slots.svg`는 WASM linear memory 안의 64개 슬롯과 acquire/commit/view/copy/release 흐름을 설명한다.
- `trust-boundary.svg`는 byteOffset, packet length/CRC32, reordering, actualSize가 신뢰 경계임을 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-26은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. zero-copy를 과장하지 않고, ChunkPool에서 WASM ZeroCopyPacketPool로 내려간 이유와 WebRTC detach/receiver verification/storage finalize 때문에 남아야 했던 경계를 보수적으로 정리한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
