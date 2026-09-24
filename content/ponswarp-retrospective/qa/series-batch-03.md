# PonsWarp 회고 시리즈 3차 배치 QA

## 대상 범위

- post-23
- post-24
- post-25
- post-26
- post-27
- post-28
- post-29
- post-30

## 파일 존재 확인

- 결과: PASS
- `content/ponswarp-retrospective/drafts/post-23.txt` ~ `post-30.txt` 존재 확인
- `content/ponswarp-retrospective/html/post-23.html` ~ `post-30.html` 존재 확인
- `content/ponswarp-retrospective/qa/post-23.md` ~ `post-30.md` 존재 확인

## 공통 구조 QA

- 결과: PASS
- Season 2의 무결성/저장/복구 아크에서 Season 3의 Rust/WASM 코어 분리 아크로 자연스럽게 이어집니다.
- 각 글은 문제 제기, 제품 상태, 시스템 구조, 실패 지점, 설계 변경, 회고 판단, 읽은 코드 흐름을 유지합니다.
- packet, ZIP64, zero-copy, Merkle tree, file signature, reordering, crypto가 왜 코어 책임으로 묶였는지 서로 연결해서 설명합니다.

## 금지 표현 QA

- 결과: PASS
- 검색 패턴:
  - `한 줄 요약`
  - `먼저 핵심만 보자`
  - `결론적으로`
  - `시사하는 바가 크다`
  - markdown fence ```
  - placeholder / TODO / `[IMAGE]`
- 대상 범위 `drafts/`, `html/` 기준 일치 항목이 없습니다.

## HTML 형식 QA

- 결과: PASS
- 모든 글이 Tistory-ready HTML fragment 형식입니다.
- 전체 HTML 문서 래퍼(`html`, `head`, `body`)가 없습니다.
- data URI SVG 삽입을 확인했습니다.
- info box, insight box, blockquote, dark code reference box, figure/caption 구성이 유지됩니다.

## 시각 자료 QA

- 결과: PASS
- 각 글에 2~3장의 설명용 SVG가 들어갑니다.
- 장식보다 구조/플로우/알고리즘/계약 변화를 설명하는 이미지가 중심입니다.
- 직접 재확인한 글:
  - post-23
  - post-24
  - post-25
  - post-26
  - post-27
  - post-28
  - post-29
  - post-30

## 로컬 렌더 QA

- 결과: PASS
- 로컬 브라우저에서 본문 비어 있지 않음과 텍스트 추출 정상 확인:
  - `post-23.html`
  - `post-26.html`

## CLI 입력 경로 QA

- 결과: PASS
- `publish-manifest.draft.json`에 post-23~30을 반영했습니다.
- 이후 시리즈 dry-run에서 해당 글들도 `bodyFormat: "html"`로 인식돼야 합니다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 시리즈 전체 50편 작성이 아직 완료되지 않았습니다.
  - 실제 Tistory 로그인 상태에서 raw HTML body가 편집기에 원하는 형태로 들어가는지 아직 실발행 검증 전입니다.
  - 공개 페이지 기준 제목/카테고리/이미지/본문 렌더 일치 검증이 아직 없습니다.

## 총평

3차 배치 8편은 초안, HTML, 개별 QA, 시각 자료, manifest 반영까지 올라왔습니다. Season 3의 코어 분리 흐름이 packet, ZIP64, zero-copy, Merkle/file signature, reordering, crypto, Rust core 총괄 주제로 자연스럽게 정리됩니다. 다만 전체 시리즈 완성과 공개 발행 검증이 아직 남아 있으므로 최종 완료로 보면 안 됩니다.
