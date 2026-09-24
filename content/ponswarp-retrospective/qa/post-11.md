# post-11 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-11.txt`
- HTML: `content/ponswarp-retrospective/html/post-11.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-11/corruption-path.svg`
  - `content/ponswarp-retrospective/assets/post-11/zip-size-semantics.svg`
  - `content/ponswarp-retrospective/assets/post-11/trust-layers.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 파일 손상을 단순 UX 문제가 아니라 받은 파일을 신뢰할 수 있는가의 문제로 제시한다.
- 본문이 파일 손상의 위험, 순서 보장, ZIP size semantics, checksum/verification, 저장 완료 경계, 4층 시스템 구조, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-10의 Push/AIMD 이후 무결성 문제로 자연스럽게 이어진다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- `4650d02`의 “완전 해결” 표현을 그대로 과장하지 않고 이후 backpressure/RTT/WASM/partial recovery가 이어졌다고 보수적으로 설명한다.
- 영웅담보다 원본 size 오신뢰, async write 완료 의미 오판, 전송 완료와 저장 완료 혼동을 드러낸다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `db175bf fix: WebRTC 데이터 수신부 버퍼 처리 오류로 인한 파일 손상 문제 해결`
  - `8aff234 fix: WebRTC 데이터 수신부 버퍼 처리 오류로 인한 파일 손상 문제 해결 (개선판)`
  - `4650d02 fix: 파일 깨짐 문제 완전 해결 및 대용량 전송 성능 대폭 개선`
  - `21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
  - `e589cf2 feat: 압축, Merkle Tree, 파일 서명 기능 추가`
- 코드 앵커:
  - `PonsWarp/FILE_CORRUPTION_FIX.md` at `4650d02`
  - `PonsWarp/src/services/directFileWriter.ts:1019-1093`
  - `PonsWarp/src/services/reorderingBuffer.ts:1-65`
  - `PonsWarp/src/workers/file-receiver.worker.ts:220-250`
  - `PonsWarp/src/utils/constants.ts:36`
  - `pons-core-wasm/src/packet.rs:31-141`
  - `pons-core-wasm/src/merkle_tree.rs:1-6, 232-245`
- 근거 범위는 공개/로컬 저장소에서 확인 가능한 커밋 메시지와 코드 구조로 제한했다.

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 디자인 패턴
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 핵심 로직
  - 알고리즘
  - 제품 판단 변화
- 파일 손상을 진행률 UX가 아니라 WebRTC packet, reordering, async writer, ZIP size semantics, CRC32 verification, Merkle/file signature로 이어지는 신뢰 경계로 설명한다.
- CRC32가 보안 서명이 아니라 우발적 손상 감지 장치라는 한계를 명시한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, figcaption, blue info box, yellow insight box, blockquote, dark code reference box 포함
- 이미지 3개가 `data:image/svg+xml;base64,` data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `corruption-path.svg`는 packet, reordering, async write, saved file 사이에서 손상이 생기는 경로를 설명한다.
- `zip-size-semantics.svg`는 manifest 원본 크기와 실제 ZIP byte length가 달라지는 문제를 설명한다.
- `trust-layers.svg`는 CRC32, reordering, save boundary, Merkle/file signature가 서로 다른 신뢰 층임을 보여 준다.
- 세 SVG 모두 HTML에 base64 data URI로 임베드되어 있으며 각 이미지에 캡션이 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 미확정

## 총평

post-11은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. 파일 손상을 UX 불편이 아니라 제품 신뢰의 붕괴로 다루며, `db175bf`, `8aff234`, `4650d02`, `21dc9ba`, `e589cf2`를 기준으로 순서 보장, 저장 의미론, CRC32, Merkle/file signature까지 보수적으로 연결한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
