# PonsWarp 회고 시리즈 2차 배치 QA

## 대상 범위

- post-11
- post-12
- post-13
- post-14
- post-15
- post-16
- post-17
- post-18
- post-19
- post-20
- post-21
- post-22

## 파일 존재 확인

확인 결과 아래 세 그룹이 모두 존재합니다.

- `content/ponswarp-retrospective/drafts/post-11.txt` ~ `post-22.txt`
- `content/ponswarp-retrospective/html/post-11.html` ~ `post-22.html`
- `content/ponswarp-retrospective/qa/post-11.md` ~ `post-22.md`

## 공통 구조 QA

- 결과: PASS
- 성능/무결성/복구/코어 분리 직전까지의 흐름이 끊기지 않게 이어집니다.
- 각 글은 문제 제기, 제품 상태, 시스템 구조, 실패 지점, 설계 변경, 회고 판단, 읽은 코드에 가까운 뼈대를 유지합니다.
- 무결성, 저장 완료, backpressure, RTT 제어, LAN 튜닝, reordering, partial recovery가 서로 어떤 선행 조건 관계에 있었는지 연결해서 설명합니다.

## 금지 표현 QA

- 결과: PASS
- 검색 패턴:
  - `한 줄 요약`
  - `먼저 핵심만 보자`
  - `결론적으로`
  - `시사하는 바가 크다`
  - markdown fence ```
  - placeholder / TODO / `[IMAGE]`
- 해당 범위 `drafts/`, `html/` 기준 일치 항목이 없습니다.

## HTML 형식 QA

- 결과: PASS
- 모든 글이 Tistory-ready HTML fragment 형식입니다.
- 전체 HTML 문서 래퍼(`html`, `head`, `body`)가 없습니다.
- data URI SVG 삽입을 확인했습니다.
- info box, insight box, blockquote, dark code reference box, figure/caption 구성이 유지됩니다.

## 시각 자료 QA

- 결과: PASS
- 각 글에 2~3장의 설명용 SVG가 들어갑니다.
- 장식용보다 구조/플로우/알고리즘/계약 변화를 설명하는 이미지가 중심입니다.
- 직접 재확인한 글:
  - post-11
  - post-12
  - post-13
  - post-14
  - post-16
  - post-17
  - post-18
  - post-19
  - post-20
  - post-21
  - post-22

## 로컬 렌더 QA

- 결과: PASS
- 로컬 브라우저에서 본문 비어 있지 않음과 텍스트 추출 정상 확인:
  - `post-11.html`
  - `post-14.html`
  - `post-15.html`
  - `post-16.html`
  - `post-18.html`
  - `post-22.html`

## CLI 입력 경로 QA

- 결과: PASS
- `publish-manifest.draft.json`이 현재 22편을 가리킵니다.
- `scripts/publish-ponslink-series.mjs --dry-run --headless` 기준으로 22편 모두 `bodyFormat: "html"`로 인식됩니다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 시리즈 전체 50편 작성이 아직 완료되지 않았습니다.
  - 실제 Tistory 로그인 상태에서 raw HTML body가 편집기에 원하는 형태로 들어가는지 아직 실발행 검증 전입니다.
  - 공개 페이지 기준 제목/카테고리/이미지/본문 렌더 일치 검증이 아직 없습니다.

## 총평

2차 배치 12편은 초안, HTML, 개별 QA, 시각 자료, manifest 반영까지 올라왔습니다. Season 1 후반부터 Season 3 초입 직전까지의 연결이 자연스럽고, 성능 최적화와 무결성/복구 계약 사이의 우선순위 변화를 보수적으로 정리합니다. 다만 전체 시리즈 완성과 공개 발행 검증이 아직 남아 있으므로 최종 완료로 보면 안 됩니다.
