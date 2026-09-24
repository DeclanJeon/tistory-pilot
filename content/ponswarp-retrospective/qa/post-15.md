# post-15 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-15.txt`
- HTML: `content/ponswarp-retrospective/html/post-15.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-15/phase2-pipeline.svg`
  - `content/ponswarp-retrospective/assets/post-15/chunk-pool-memory.svg`
  - `content/ponswarp-retrospective/assets/post-15/sender-receiver-pressure.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 Push/AIMD 이후 남은 메모리와 복사 압력을 문제로 제시한다.
- 본문이 Phase 1 한계, 이중 버퍼링, 청크 풀링, ZeroCopyPacketPool 후속 구조, receiver 압력, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-14의 pipeline 병렬화 흐름에서 post-16 backpressure 주제로 자연스럽게 이어진다.

## 톤 QA

- 결과: PASS
- 금지 표현 사용 없음
- 한국어 `~합니다` 체 유지
- 최적화를 완성된 정답으로 과장하지 않고 중간 단계와 남은 복사를 보수적으로 설명한다.
- 성능 숫자보다 브라우저 메모리, GC, 사용자 신뢰를 중심에 둔다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `949d921 feat(perf): Phase 2 - 파이프라인 병렬화 + 이중 버퍼링 + 청크 풀링`
  - `7fe0ca1 feat(core): 암호화 지원 Zero-Copy Pool 구현`
  - `54cf5f4 feat: 수신 측 역압(Backpressure) 제어 구현`
- 코드 앵커:
  - `PonsWarp/workers/file-sender.worker.v2.ts` at `949d921`
  - `PonsWarp/src/workers/file-sender.worker.ts:40-144`
  - `PonsWarp/src/workers/file-sender.worker.ts:159-188`
  - `PonsWarp/src/workers/file-sender.worker.ts:801-865`
  - `pons-core-wasm/src/zero_copy_pool.rs:24-34`
  - `PonsWarp/src/services/directFileWriter.ts:47-104`
  - `PonsWarp/src/utils/constants.ts:18-29`

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 시스템 플로우
  - 기능 구조
  - 핵심 로직
  - 알고리즘/버퍼 전략
  - 운영/브라우저 런타임 관점
  - 제품 판단 변화
- sender worker, WASM core, receiver writer, WebRTC DataChannel queue 사이의 압력 전달을 설명한다.
- chunk pooling과 double buffering을 단순 속도 개선이 아니라 메모리/GC/복사 압력 완화 장치로 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 전체 HTML 문서 래퍼 없이 Tistory 본문 fragment 형태
- figure, caption, info box, insight box, blockquote, dark code reference box 포함
- SVG 3개가 `data:image/svg+xml;base64,` data URI로 삽입됨

## 시각 자료 QA

- 결과: PASS
- `phase2-pipeline.svg`는 Phase 1 prefetch에서 DoubleBuffer/WebRTC batch로 이어지는 sender pipeline을 설명한다.
- `chunk-pool-memory.svg`는 반복 할당, ChunkPool, 후속 WASM ZeroCopyPacketPool의 관계를 설명한다.
- `sender-receiver-pressure.svg`는 sender 최적화가 DataChannel queue와 receiver write watermark로 이어지는 압력 흐름을 설명한다.
- 세 SVG 모두 HTML에 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전

## 총평

post-15는 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. `949d921`의 Phase 2 변경을 실제 코드 단위로 풀어 설명하고, 현재 `ZeroCopyPacketPool`, `DirectFileWriter`, 보수화된 DataChannel watermark까지 연결해 후속 backpressure 글로 넘어갈 수 있게 구성했다.
