# post-19 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-19.txt`
- HTML: `content/ponswarp-retrospective/html/post-19.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-19/corruption-surface.svg`
  - `content/ponswarp-retrospective/assets/post-19/evidence-verification-path.svg`
  - `content/ponswarp-retrospective/assets/post-19/contract-change-timeline.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 `21dc9ba`, `db175bf`, `8aff234`, `4650d02`를 연결해 파일 깨짐 문제가 단발성 버그가 아니라 완료 계약 문제였음을 제시한다.
- 본문이 깨짐의 표면화, 신뢰 문제, 검증 경로, 제품 계약 변화, 네 층 구조, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-08의 저장 완료 의미론과 post-11의 무결성 논의를 이어받되, post-19는 “끝까지 붙잡은 기록”이라는 회고형 종합 글로 정리한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- 파일 깨짐을 과장된 성공담으로 쓰지 않고, `4650d02`의 “완전 해결” 표현을 후속 backpressure, recovery 흐름을 고려해 보수적으로 해석한다.
- 사용자가 알아야 할 계약과 내부 검증 장치를 분리해 설명한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
  - `db175bf fix: 파일 전송 중 청크 순서 역전 및 버퍼 관리 문제 해결`
  - `8aff234 fix: 파일 전송 중복 완료 및 수신 완료 체크 로직 개선`
  - `4650d02 fix: 파일 깨짐 문제 완전 해결 및 대용량 전송 성능 대폭 개선`
  - `b185563 Make P2P transfers recover instead of saving partial files`
- 코드 앵커:
  - `PonsWarp/src/workers/file-receiver.worker.ts` — packet length, WASM verification, CRC32 fallback 처리 근거
  - `PonsWarp/src/services/directFileWriter.ts` — batch write, flush, pending bytes, reordering buffer, size-estimated manifest 처리 근거
  - `PonsWarp/src/services/reorderingBuffer.ts` — out-of-order chunk 정렬과 파일 손상 방지 근거
  - `pons-core-wasm/src/packet.rs` — PacketEncoder CRC32와 PacketDecoder 검증 근거
  - `pons-core-wasm/src/merkle_tree.rs` — 대용량 파일 부분 무결성 검증의 후속 경계 근거
- 보수성:
  - 실제 코드 전문을 새로 주장하지 않고, 이미 시리즈 evidence와 completed post에서 확인된 코드 앵커와 커밋 메시지 범위 안에서 설명한다.
  - `4650d02`를 최종 무결성 완성으로 단정하지 않고, 이후 recovery와 backpressure로 이어지는 기준선으로 설명한다.

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
  - 운영/제품 판단 변화
- 파일 깨짐이 사용자에게는 “받은 파일이 열리는가”로 보이지만, 내부적으로는 packet 검증, offset 정렬, ZIP 크기 의미론, writer flush, save-complete ACK의 조합이라는 점을 설명한다.
- 성공처럼 보이는 partial/corrupt 결과보다 recover 가능한 실패가 더 정직한 제품 계약이라는 판단을 포함한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `corruption-surface.svg`는 sender, DataChannel, receiver, storage 사이에서 파일 깨짐이 드러나는 지점을 설명한다.
- `evidence-verification-path.svg`는 packet length, checksum, reordering, flush, save-complete ACK로 이어지는 검증 경로를 설명한다.
- `contract-change-timeline.svg`는 save-complete handshake, 손상 수정, ZIP/reorder 수정, partial recovery로 이어지는 제품 계약 변화를 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-19는 파일 깨짐 문제를 단일 수정이 아니라 신뢰 계약을 보수적으로 다시 쓰는 과정으로 정리한다. 초안과 HTML은 발행 가능한 구조를 갖췄지만, 실제 발행 전에는 manifest, 카테고리, Tistory 렌더링 확인이 추가로 필요하다.
