# QA — post-49

## 대상

- 제목: PonsWarp가 PonsLink 계열로 이어진 방식
- 산출물:
  - `content/ponswarp-retrospective/drafts/post-49.txt`
  - `content/ponswarp-retrospective/html/post-49.html`
  - `content/ponswarp-retrospective/assets/post-49/lineage-map.svg`
  - `content/ponswarp-retrospective/assets/post-49/architecture-transfer.svg`
  - `content/ponswarp-retrospective/assets/post-49/judgment-inheritance.svg`

## 구조 QA

- 시리즈 기본 골격 반영: 문제 제기, 당시 제품 상태, 시스템 구조, 실제 실패 지점, 설계 변경, 지금 돌아보는 판단, 읽은 코드와 근거를 모두 포함했다.
- 서비스 분석 항목: 프로젝트 구성, 기술 스택, 사용자 플로우, 시스템 플로우, 기능 구조, 운영/배포 관점, 제품 판단 변화를 포함했다.
- post-49의 위치에 맞게 Season 7 이후 관점으로 작성했고, 이전 글의 세부 주장을 반복하기보다 PonsLink 계열로 이어진 판단의 모양을 설명했다.

## 톤 QA

- 한국어 `~합니다` 체를 유지했다.
- 금지 표현인 “한 줄 요약”, “먼저 핵심만 보자”, “결론적으로”, “시사하는 바가 크다”를 사용하지 않았다.
- PonsLink를 PonsWarp의 단순 후속 버전으로 과장하지 않고, “문제의 연속 / 실패 분류법의 재사용”으로 보수적으로 표현했다.

## 근거 QA

- 근거 문서: `series-plan.md`, `evidence-index.md`, PonsLink deep-dive 및 algorithms 원고를 사용했다.
- 인용 커밋은 retrospective evidence index에 이미 기록된 항목으로 제한했다.
- PonsLink 내부 구현 주장은 기존 PonsLink 원고에 기록된 파일·흐름 수준으로 제한했고, 확인되지 않은 저장소 구현 세부를 새로 만들지 않았다.

## HTML QA

- `html/post-49.html`은 `<html>`, `<head>`, `<body>` 없는 Tistory-ready fragment다.
- SVG 3개를 `data:image/svg+xml;base64,...` 형태로 임베드했다.
- 코드 표기, figure, caption, evidence box 스타일은 기존 post-40 계열 HTML 관례를 따랐다.

## 시각 자료 QA

- `lineage-map.svg`: PonsWarp → 남은 질문 → PonsLink → PonsCast 계보를 설명한다.
- `architecture-transfer.svg`: PonsWarp 4층 구조가 PonsLink control plane 구조로 이동한 방식을 설명한다.
- `judgment-inheritance.svg`: 전송 신뢰, 실시간 신뢰, 제품 신뢰, 운영 신뢰로 판단이 확장된 흐름을 설명한다.
- 세 SVG는 장식용이 아니라 본문 논지를 보조하는 설명 도구로 배치했다.

## Publish readiness

- 상태: REVISE
- 이유: 원고, HTML fragment, SVG 자산은 준비됐지만 Tistory live publish와 게시 후 렌더링 확인이 아직 없다. 라이브 게시 전까지 publish readiness는 REVISE로 유지한다.
