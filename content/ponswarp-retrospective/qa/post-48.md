# post-48 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-48.txt`
- HTML: `content/ponswarp-retrospective/html/post-48.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-48/analytics-blind-spot.svg`
  - `content/ponswarp-retrospective/assets/post-48/measurement-stack.svg`
  - `content/ponswarp-retrospective/assets/post-48/decision-loop.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 `d88a625 Enable production traffic measurement with GA4`를 post-48의 기준점으로 세웠다.
- 본문이 당시 제품 상태, 제품화가 만든 측정 필요, analytics가 드러낸 빈칸, 시스템 구조, 실제 실패 지점, 설계 변경, 회고 판단, 읽은 기록으로 나뉜다.
- 시리즈 기본 골격의 문제 제기, 제품 상태, 시스템 구조, 실패 지점, 설계 변경, 회고 판단, 읽은 코드/기록을 모두 포함한다.

## 톤 QA

- 결과: PASS
- 금지 표현 사용 없음: `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, `시사하는 바가 크다`를 쓰지 않았다.
- `~합니다` 체를 기본으로 유지했다.
- GA4를 만능 답으로 과장하지 않고, 늦게 붙은 관찰 계층이 제품의 가정을 드러낸 과정으로 설명했다.
- 실제 사용자 수, 매출, 전환율, 벤치마크 등 확인되지 않은 수치를 invent하지 않았다.

## 근거 QA

- 결과: PASS
- 사용 근거 문서:
  - `series-plan.md`의 post-48 제목, 4층 구조, 제품화 구간
  - `evidence-index.md`의 제품화/수익화 커밋 인덱스와 GA4 production measurement 기록
- 사용 커밋:
  - `ad322f3`, `638bc83`, `21dc9ba`, `2def330`, `db175bf`, `4650d02`
  - `949d921`, `54cf5f4`, `09161ce`
  - `15aef19`, `1b6fb15`, `58e6b89`, `e589cf2`, `7fe0ca1`
  - `4847872`, `b6f3ea8`, `f8f2120`, `2e4593d`, `3628858`, `a004c91`, `212d751`, `8f7299d`, `d88a625`
- 보수성:
  - 현재 작업공간의 기존 회고 자료와 evidence index에 적힌 범위 안에서만 주장했다.
  - GA4 event schema, 실제 funnel 수치, 사용자 세그먼트, 매출 데이터는 확인 근거가 없어 언급하지 않았다.
  - analytics는 “정답”이 아니라 제품 질문과 빈칸을 드러내는 계층으로 제한해 설명했다.

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
- 웹 제품 표면, 브라우저 전송 엔진, 저장/복구 계층, WASM core/backend, GA4 측정 계층을 분리해 설명했다.
- direct transfer, Cloud Drop, pricing, free plan, billing, mobile resume이 analytics 이후 경로 중심 질문으로 재배열되는 흐름을 설명했다.

## HTML QA

- 결과: PASS
- Tistory-ready fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼가 없다.
- 마크다운 fence 없음.
- figure, figcaption, info box, code reference box 포함.
- 이미지 3개가 base64 `data:image/svg+xml` URI로 삽입됨.

## 시각 자료 QA

- 결과: PASS
- `analytics-blind-spot.svg`는 GA4 전후로 제품 질문이 어떻게 바뀌는지 설명한다.
- `measurement-stack.svg`는 기존 4층 구조 위에 측정 계층이 올라오는 구도를 설명한다.
- `decision-loop.svg`는 사용자 흐름, 이벤트 신호, 제품 판단 루프를 설명한다.
- 세 SVG 모두 HTML에 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 실제 Tistory 렌더링 확인 전
  - publish manifest 미작성
  - 카테고리/태그 확정 전
  - 공개 URL 없음
  - 라이브 publish 기록 없음

## 총평

post-48은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. 주제인 “analytics를 붙이고 나서야 보인 것들”을 GA4 사용법이나 숫자 해석으로 과장하지 않고, PonsWarp가 제품화 구간에서 Cloud Drop, pricing, entitlement, free plan, mobile resume까지 품은 뒤에야 사용자 경로를 관찰하게 된 과정으로 정리했다. 라이브 발행 전에는 manifest, 카테고리, 실제 Tistory 렌더링, 공개 URL 확인이 필요하므로 publish readiness는 REVISE다.
