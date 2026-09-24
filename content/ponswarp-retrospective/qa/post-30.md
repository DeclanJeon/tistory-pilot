# post-30 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-30.txt`
- HTML: `content/ponswarp-retrospective/html/post-30.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-30/boundary-map.svg`
  - `content/ponswarp-retrospective/assets/post-30/product-not-performance.svg`
  - `content/ponswarp-retrospective/assets/post-30/core-contract.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 브라우저 앱인데 Rust/WASM 코어가 필요한 이유를 질문으로 제시한다.
- 본문이 브라우저에 남은 책임, 코어로 내려간 책임, 성능/제품 결정의 이중성, JS/Rust 경계 기준, Rust 만능론 방지, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-22의 무결성 arc를 Rust/WASM 코어 분리 주제로 이어 받는다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- “JS는 느리고 Rust는 빠르다”로 단순화하지 않고, 브라우저 제품 표면과 바이트 검증 코어의 책임 분리로 설명한다.
- Rust/WASM을 만능 해결책으로 과장하지 않고 DataChannel, backpressure, ACK, writer idle, UI 실패 설명의 남은 책임을 명시한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `15aef19 feat: 초기 pons-core-wasm 프로젝트 설정`
  - `1b6fb15 feat(zip64): 4GB 이상 파일 지원을 위한 ZIP64 스트리밍 압축 기능 추가`
  - `7b0301d feat(sender): WASM ZIP64 압축으로 마이그레이션`
  - `58e6b89 feat: 수신측 패킷 재정렬 버퍼를 wasm으로 마이그레이션`
  - `e589cf2 feat: 압축, Merkle Tree, 파일 서명 기능 추가`
  - `7fe0ca1 feat(core): 암호화 지원 Zero-Copy Pool 구현`
- 코드 앵커:
  - `PonsWarp/src/App.tsx`
  - `PonsWarp/src/components/SenderView.tsx`
  - `PonsWarp/src/components/ReceiverView.tsx`
  - `PonsWarp/src/components/CloudSenderView.tsx`
  - `PonsWarp/src/services/webRTCService.ts:659-763`
  - `PonsWarp/src/services/directFileWriter.ts:1297-1490`
  - `PonsWarp/src/utils/constants.ts:11-43`
  - `PonsWarp/src/utils/transferFlowControl.ts:12-54`
  - `PonsWarp/src/workers/file-sender.worker.ts:5-19`
  - `PonsWarp/src/workers/file-receiver.worker.ts:6-12, 38-55`
  - `PonsWarp/src/wasmCore.ts`
- 보수성:
  - 현재 작업공간에는 PonsWarp 원본 저장소가 없으므로, `evidence-index.md`와 완료된 post-22가 제공한 앵커 범위 안에서만 주장했다.
  - 성능 수치, 벤치마크, 실제 배포 결과, 공개 URL을 새로 만들지 않았다.
  - Merkle Tree와 file signature는 `e589cf2` 근거의 기능 추가 흐름으로만 언급하고 세부 구현을 invent하지 않았다.

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
- 브라우저 UI/JS가 맡는 사용자 상태, WebRTC 연결, 저장 권한, backpressure와 Rust/WASM 코어가 맡는 packet, crypto, ZIP64, reordering, CRC32를 분리해 설명한다.
- worker가 UI와 코어 사이의 번역 계층이라는 시스템 경계를 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `boundary-map.svg`는 Browser UI/JS/Worker와 Rust/WASM Core의 책임 경계를 설명한다.
- `product-not-performance.svg`는 Rust 선택을 Performance, Product Trust, Portability의 제품 결정으로 설명한다.
- `core-contract.svg`는 packet, crypto, ZIP64, reordering/CRC 계약이 완료 표시의 하위 불변식임을 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-30은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. 브라우저 앱의 제품 표면은 JS에 남고, 패킷·암호화·ZIP64·재정렬·체크섬 같은 바이트 계약은 Rust/WASM 코어로 내려간 이유를 성능과 제품 신뢰의 이중 결정으로 정리한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
