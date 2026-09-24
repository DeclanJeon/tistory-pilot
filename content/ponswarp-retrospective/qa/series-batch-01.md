# PonsWarp 회고 시리즈 1차 배치 QA

## 대상 범위

- post-01
- post-02
- post-03
- post-04
- post-05
- post-06
- post-07
- post-08
- post-09
- post-10

## 파일 존재 확인

확인 결과 아래 세 그룹이 모두 존재합니다.

- `content/ponswarp-retrospective/drafts/post-01.txt` ~ `post-10.txt`
- `content/ponswarp-retrospective/html/post-01.html` ~ `post-10.html`
- `content/ponswarp-retrospective/qa/post-01.md` ~ `post-10.md`

## 공통 구조 QA

- 결과: PASS
- 모든 글이 문제 제기, 제품 상태, 시스템 구조, 실패 지점, 설계 변경, 회고 판단, 읽은 코드에 가까운 흐름을 유지합니다.
- 각 글은 감상문으로 끝나지 않고 제품/서비스 분석 항목을 포함합니다.

## 금지 표현 QA

- 결과: PASS
- 검색 패턴:
  - `한 줄 요약`
  - `먼저 핵심만 보자`
  - `결론적으로`
  - `시사하는 바가 크다`
- `drafts/`, `html/` 전체 검색 기준 일치 항목이 없습니다.

## HTML 형식 QA

- 결과: PASS
- `html/` 파일들에 마크다운 fence가 없습니다.
- placeholder 검색 기준 일치 항목이 없습니다.
- `post-02`, `post-09`, `post-10`은 data URI 이미지 삽입을 직접 재확인했습니다.

## 시각 자료 QA

- 결과: PASS
- 각 글은 최소 2개 이상의 설명용 SVG를 포함합니다.
- SVG는 `assets/post-XX/`에 저장돼 있고, 대응 HTML에는 data URI로 삽입됩니다.
- 장식용 이미지보다 서비스 구조, 전송 플로우, 알고리즘 제어를 설명하는 도식이 중심입니다.

## 로컬 렌더 QA

- 결과: PASS
- 로컬 브라우저 확인 완료:
  - `post-02.html`
  - `post-03.html`
  - `post-06.html`
  - `post-08.html`
  - `post-10.html`
- 텍스트 추출 기준으로 본문이 비어 있지 않고 이미지 캡션이 함께 노출됩니다.

## CLI 입력 경로 QA

- 결과: PASS
- `publish-manifest.draft.json`이 현재 10편을 가리킵니다.
- `scripts/publish-ponslink-series.mjs --dry-run --headless` 기준으로 10편 모두 `bodyFormat: "html"`로 인식됩니다.
- `scripts/tistory-post.mjs`의 raw HTML body 추론 경로는 JSON parse 및 dry-run 기준 정상입니다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 시리즈 전체 50편 작성이 아직 완료되지 않았습니다.
  - 실제 Tistory 로그인 상태에서 raw HTML body가 편집기에 원하는 형태로 들어가는지 아직 실발행 검증 전입니다.
  - 공개 페이지 기준 제목, 카테고리, 이미지, 본문 렌더 일치 검증이 아직 없습니다.

## 총평

1차 배치 10편은 초안, HTML, 개별 QA, 설명용 시각 자료, manifest 반영까지 진행되어 발행 직전 수준에 도달했습니다. 다만 전체 시리즈 완성과 실제 공개 발행 검증이 아직 남아 있으므로 현재 상태를 최종 완료로 보면 안 됩니다.
