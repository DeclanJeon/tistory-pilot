# post-42 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-42.txt`
- HTML: `content/ponswarp-retrospective/html/post-42.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-42/desktop-fork-gap.svg`
  - `content/ponswarp-retrospective/assets/post-42/complexity-stack.svg`
  - `content/ponswarp-retrospective/assets/post-42/survival-equation.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 데스크톱/native/QUIC 기대가 왜 자연스러웠는지 제시한 뒤, 그것이 왜 생존으로 이어지지 못했는지 문제를 세운다.
- 본문이 당시 제품 상태, 데스크톱 분기의 매력, 두 번째 제품이 된 이유, 시스템 구조, 제품화 압력, 실제 실패 지점, 회고 판단, 읽은 기록으로 나뉜다.
- 시리즈 기본 골격의 문제 제기, 제품 상태, 시스템 구조, 실패 지점, 설계 변경, 회고 판단, 읽은 코드/기록을 모두 포함한다.

## 톤 QA

- 결과: PASS
- 금지 표현 사용 없음: `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, `시사하는 바가 크다`를 쓰지 않았다.
- `~합니다` 체를 기본으로 유지했다.
- 데스크톱 분기를 조롱하거나 단순 실패로 처리하지 않고, 합리적인 기술 욕망이 제품 표면과 운영 범위를 넓힌 과정으로 설명했다.
- “기술력이 부족했다”는 식의 과잉 단순화를 피하고, 해결한 기술 과제와 남은 제품 질문을 분리했다.

## 근거 QA

- 결과: PASS
- 사용 근거 문서:
  - `series-plan.md`의 post-42 제목, 4층 구조, 데스크톱 분기, 제품화 구간
  - `evidence-index.md`의 저장소별 핵심 구간과 커밋 인덱스
- 사용 커밋:
  - `638bc83`, `21dc9ba`, `2def330`, `db175bf`, `4650d02`
  - `15aef19`, `1b6fb15`, `58e6b89`, `e589cf2`, `7fe0ca1`
  - `44fb5ad`, `b834716`, `f1c69cb`
  - `4847872`, `b6f3ea8`, `f8f2120`, `2e4593d`, `3628858`, `a004c91`, `212d751`, `d88a625`
- 보수성:
  - 현재 작업공간에 원본 PonsWarp 저장소 전체가 없으므로, 기존 회고 자료와 evidence index에 적힌 범위 안에서만 주장했다.
  - 데스크톱 구현 세부, 실제 사용자 수, 매출, 벤치마크, 공개 배포 결과를 새로 invent하지 않았다.
  - `ponswarp-desktop`은 created date와 native/QUIC/Tauri 기대, late visible activity 수준으로만 다뤘다.

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 핵심 로직
  - 운영/배포 관점
  - 제품 판단 변화
- 웹 제품 표면, 브라우저 전송 엔진, 저장/복구 계층, WASM core/backend 계층을 분리해 설명했다.
- 데스크톱 전환이 한 계층만 바꾸는 변경이 아니라 UI, 전송, 저장, backend 계약을 다시 여는 선택임을 설명했다.

## HTML QA

- 결과: PASS
- Tistory-ready fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼가 없다.
- 마크다운 fence 없음.
- figure, figcaption, info box, code reference box 포함.
- 이미지 3개가 base64 `data:image/svg+xml` URI로 삽입됨.

## 시각 자료 QA

- 결과: PASS
- `desktop-fork-gap.svg`는 Web P2P → Native Hope → Survival Gap 흐름을 설명한다.
- `complexity-stack.svg`는 사용자 흐름, 시스템 흐름, 제품화 흐름이 동시에 커진 구조를 설명한다.
- `survival-equation.svg`는 해결된 기술 과제와 남은 제품/운영 질문의 불균형을 설명한다.
- 세 SVG 모두 HTML에 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 실제 Tistory 렌더링 확인 전
  - publish manifest 미작성
  - 카테고리/태그 확정 전
  - 공개 URL 없음

## 총평

post-42는 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. 주제인 “그런데 왜 결국 살아남지 못했나”를 데스크톱 분기의 실패담으로 축소하지 않고, 웹·WASM core·signaling server·Cloud Drop·billing·analytics로 넓어진 제품 면적과 우선순위 문제로 정리했다. 라이브 발행 전에는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 필요하므로 publish readiness는 REVISE다.
