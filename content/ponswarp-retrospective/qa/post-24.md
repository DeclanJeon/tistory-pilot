# post-24 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-24.txt`
- HTML: `content/ponswarp-retrospective/html/post-24.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-24/boundary-map.svg`
  - `content/ponswarp-retrospective/assets/post-24/responsibility-split.svg`
  - `content/ponswarp-retrospective/assets/post-24/fallback-contract.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 제목 ``pons-core-wasm`를 따로 만든 이유`에 맞춰 별도 코어 경계가 필요해진 이유를 중심 주제로 삼았다.
- 본문이 분리 필요 시점, WASM으로 내려간 책임, JS/browser land에 남은 책임, 별도 모듈 경계의 의미, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- Season 3의 Rust/WASM 코어 분리 흐름에서 post-25 이후 ZIP64, zero-copy, Merkle tree, reordering buffer 주제로 이어지는 연결을 설명한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- Rust/WASM을 마법의 해결책으로 과장하지 않고, WASM 우선 경로와 JS fallback이 함께 남아 있다는 보수적 설명을 포함한다.
- “JS가 느려서 Rust로 갔다”라는 단순화 대신 책임 경계와 바이트 계약 중심으로 설명한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `2025-12-04 15aef19 feat: 초기 pons-core-wasm 프로젝트 설정`
  - `2025-12-05 1b6fb15 feat(zip64): 4GB 이상 파일 지원을 위한 ZIP64 스트리밍 압축 기능 추가`
  - `2025-12-05 7b0301d feat(sender): WASM ZIP64 압축으로 마이그레이션`
  - `2025-12-06 58e6b89 feat: 수신측 패킷 재정렬 버퍼를 wasm으로 마이그레이션`
  - `2025-12-08 e589cf2 feat: 압축, Merkle Tree, 파일 서명 기능 추가`
  - `2025-12-08 7fe0ca1 feat(core): 암호화 지원 Zero-Copy Pool 구현`
- 코드/문서 앵커:
  - `content/ponswarp-retrospective/evidence-index.md:17-21`
  - `content/ponswarp-retrospective/evidence-index.md:79-87`
  - `content/ponswarp-retrospective/series-plan.md:137-148`
  - `content/ponswarp-retrospective/series-plan.md:208-216`
  - `content/ponswarp-retrospective/series-plan.md:273-281`
  - `content/ponswarp-retrospective/drafts/post-11.txt:39-45`
  - `content/ponswarp-retrospective/drafts/post-15.txt:35-39`
  - `content/ponswarp-retrospective/drafts/post-20.txt:35-39`
  - `content/ponswarp-retrospective/drafts/post-22.txt:49-51`
- 보수성:
  - 실제 `pons-core-wasm` 소스 파일을 이 작업 범위 밖에서 새로 열어 확인하지 않고, 기존 시리즈 evidence와 완료된 글의 앵커만 사용했다.
  - ZIP64, Merkle Tree, file signature, zero-copy는 후속 주제의 연결점과 기존 근거 수준으로만 설명하고 세부 구현을 새로 invent하지 않음.
  - live publish, 공개 URL, Tistory 렌더링 확인을 완료했다고 주장하지 않음.

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
- JS/browser land와 Rust/WASM core의 책임 분리를 명시한다.
- packet, CRC32, ZIP64, reordering buffer, ZeroCopyPacketPool, Merkle Tree/file signature를 바이트 계약의 예로 설명한다.
- SenderView/ReceiverView, WebRTC DataChannel, worker protocol, DirectFileWriter, StreamSaver/File System Access API는 브라우저 쪽 책임으로 남았다고 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `boundary-map.svg`는 JS/browser land와 `pons-core-wasm` 경계를 설명한다.
- `responsibility-split.svg`는 WASM으로 내려간 책임과 브라우저에 남은 책임을 대조한다.
- `fallback-contract.svg`는 WASM 우선 검증 경로와 JS fallback이 공존하는 보수적 계약을 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-24는 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. `pons-core-wasm` 분리를 성능 과시가 아니라 바이트 계약과 브라우저 현실의 책임 분리로 보수적으로 설명한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
