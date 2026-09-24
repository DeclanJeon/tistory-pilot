# post-23 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-23.txt`
- HTML: `content/ponswarp-retrospective/html/post-23.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-23/core-boundary.svg`
  - `content/ponswarp-retrospective/assets/post-23/copy-boundaries.svg`
  - `content/ponswarp-retrospective/assets/post-23/deterministic-core.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 “JS가 느려서 Rust로 갔다”는 단순 설명을 피하고, 브라우저 JS 계층만으로 닫히지 않는 전송 core 책임을 제시한다.
- 본문이 JS 계층의 역할, packet verification, memory pressure와 copy boundary, deterministic core responsibilities, Rust/WASM 책임 분리, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- Season 3의 첫 글로서 post-22의 무결성 우선 결론을 Rust/WASM 코어 분리 주제로 연결한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- Rust/WASM을 만능 해결책으로 과장하지 않고, JS fallback과 WebRTC copy boundary가 남아 있음을 명시한다.
- JS 계층을 폄하하지 않고 React, worker JS, 브라우저 API가 계속 맡아야 하는 역할과 core 책임을 구분한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `15aef19 feat: 초기 pons-core-wasm 프로젝트 설정`
  - `1b6fb15 feat(zip64): 4GB 이상 파일 지원을 위한 ZIP64 스트리밍 압축 기능 추가`
  - `7b0301d feat(sender): WASM ZIP64 압축으로 마이그레이션`
  - `58e6b89 feat: 수신측 패킷 재정렬 버퍼를 wasm으로 마이그레이션`
  - `e589cf2 feat: 압축, Merkle Tree, 파일 서명 기능 추가`
  - `7fe0ca1 feat(core): 암호화 지원 Zero-Copy Pool 구현`
- 코드/문서 앵커:
  - `content/ponswarp-retrospective/evidence-index.md:79-86`
  - `content/ponswarp-retrospective/series-plan.md:137-148`
  - `content/ponswarp-retrospective/series-plan.md:273-281`
  - `content/ponswarp-retrospective/drafts/post-11.txt:39-45`
  - `content/ponswarp-retrospective/drafts/post-15.txt:35-38`
  - `content/ponswarp-retrospective/drafts/post-20.txt:37-39`
  - `content/ponswarp-retrospective/drafts/post-22.txt:49-51`
- 보수성:
  - Rust/WASM 전환을 성능만의 문제로 단정하지 않음
  - zero-copy를 “복사 0회”로 과장하지 않고 WebRTC detach 때문에 남는 복사를 설명함
  - Merkle Tree와 file signature는 evidence index와 기존 post-11 근거 범위 안에서만 언급함

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
- React/UI, worker JS, Rust/WASM core, storage 계층의 책임 경계를 분리해 설명한다.
- packet verification, CRC32, reordering buffer, ZIP64, crypto, zero-copy pool, Merkle Tree, file signature가 왜 deterministic core 쪽 책임으로 이동했는지 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `core-boundary.svg`는 React UI, Worker JS, Rust/WASM Core, Storage의 책임 경계를 설명한다.
- `copy-boundaries.svg`는 JS Pool, WASM Memory, WebRTC detach edge를 통해 memory pressure와 copy boundary를 설명한다.
- `deterministic-core.svg`는 packet, reorder, ZIP64/crypto, proof 계열 책임을 core 책임으로 정리한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-23은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. JS에서 Rust/WASM으로 내려간 이유를 속도 우열이 아니라 packet verification, memory pressure, copy boundary, integrity, deterministic core responsibility의 경계 이동으로 보수적으로 정리한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
