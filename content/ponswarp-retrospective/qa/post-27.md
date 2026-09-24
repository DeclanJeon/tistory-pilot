# post-27 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-27.txt`
- HTML: `content/ponswarp-retrospective/html/post-27.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-27/trust-model-stack.svg`
  - `content/ponswarp-retrospective/assets/post-27/merkle-proof-path.svg`
  - `content/ponswarp-retrospective/assets/post-27/file-signature-gate.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 packet checksum과 save-complete가 필요했지만 충분하지 않았다는 문제를 제시한다.
- 본문이 packet-level check의 범위, save-complete의 한계, Merkle tree의 부분 증명 역할, file signature의 최종 산출물 경계, 다층 신뢰 모델, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-22의 무결성 우선 결론에서 Season 3의 Rust/WASM 코어 검증 책임으로 자연스럽게 이어진다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- CRC32와 save-complete를 실패한 장치로 과장하지 않고, 각 장치의 책임 범위를 구분한다.
- file signature의 구체 알고리즘은 저장소 근거 범위를 넘겨 invent하지 않고, 확인 가능한 커밋/시리즈 설계 범위로 제한한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `e589cf2 feat: 압축, Merkle Tree, 파일 서명 기능 추가`
  - `21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
  - `b185563 Make P2P transfers recover instead of saving partial files`
- 코드/문서 앵커:
  - `PonsWarp/src/utils/constants.ts` — `HEADER_SIZE`, FileIndex, ChunkIndex, Offset, DataLen, Checksum 경계
  - `pons-core-wasm/src/packet.rs` — PacketEncoder CRC32 기록과 PacketDecoder 검증
  - `PonsWarp/src/workers/file-receiver.worker.ts` — packet length 검증, WASM verification, CRC32 fallback 처리
  - `PonsWarp/src/services/directFileWriter.ts` — write 완료, writer idle, actualSize, finalize 계층의 저장 완료 경계
  - `pons-core-wasm/src/merkle_tree.rs:1-6, 232-245` — 대용량 파일 부분 무결성 검증과 proof verification
  - `content/ponswarp-retrospective/series-plan.md:273-281` — Season 3의 Rust/WASM 코어 분리와 post-27 위치
- 보수성:
  - Merkle tree는 부분 무결성/proof verification 역할로 설명하고, 성능 수치나 실제 운영 성공 사례를 새로 만들지 않음
  - file signature는 최종 산출물 경계의 역할로 설명하되, 저장소에서 확인되지 않은 알고리즘 세부를 단정하지 않음

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
- packet checksum, receiver 저장 완료, Merkle proof, file signature를 같은 무결성 기능으로 뭉개지 않고 서로 다른 신뢰 경계로 설명한다.
- 사용자가 보는 “받았다”라는 완료 문장이 내부적으로 여러 검증 층의 합이라는 제품 판단을 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `trust-model-stack.svg`는 packet, storage, Merkle, file signature로 나뉜 다층 신뢰 모델을 설명한다.
- `merkle-proof-path.svg`는 chunk hash에서 root hash까지 이어지는 proof path를 설명한다.
- `file-signature-gate.svg`는 packet/save/Merkle 이후에도 최종 파일 형식과 산출물 경계가 남는다는 점을 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-27은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. packet-level checksum과 save-complete를 부정하지 않고, Merkle tree와 file signature가 왜 추가 신뢰 경계로 필요했는지를 보수적으로 정리한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
