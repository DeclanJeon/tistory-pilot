# post-36 QA — 매치메이커일 뿐인 서버가 점점 무거워진 이유

## Structure QA
- 기본 7단계 골격을 유지했다: 문제 제기, 당시 제품 상태, 시스템 구조, 실제 실패 지점, 설계 변경, 지금 돌아보는 판단, 읽은 코드.
- post-36 주제에 맞춰 `왜 Cloud Drop이 결정적이었나` 섹션을 추가해 서버 책임 증가의 제품 분기점을 분리했다.
- 서비스 분석 요소 6개 이상 포함: 프로젝트 구성, 기술 스택, 사용자/시스템 플로우, 기능 구조, 운영/배포 관점, 제품 판단 변화, 핵심 로직.

## Tone QA
- 한국어 `~합니다` 체를 유지했다.
- 기존 시리즈처럼 회고형 문장과 코드 근거를 함께 사용했다.
- 시리즈 금지 문구와 AI식 요약 문장을 본문에 사용하지 않았다.
- 서버 비대화를 과장된 실패담으로 쓰지 않고, 제품 책임이 늘어난 과정으로 정리했다.

## Evidence QA
- `content/ponswarp-retrospective/series-plan.md`의 Season 4 post-36 제목과 서버 책임 흐름에 맞췄다.
- `content/ponswarp-retrospective/evidence-index.md`의 signaling evidence를 사용했다: `2def330`, `44fb5ad`, `b834716`, `4847872`, `f8f2120`, `3628858`, `f1c69cb`.
- 실제 코드 근거를 확인했다:
  - `ponswarp-signaling-rs/src/main.rs` routes, cleanup scheduler, readiness handler
  - `ponswarp-signaling-rs/src/state.rs` AppState 구성
  - `ponswarp-signaling-rs/src/handlers/room.rs` room guard / broadcast deadlock 회피 주석과 로직
  - `ponswarp-signaling-rs/src/handlers/signaling.rs` offer/answer/ICE/transfer relay
  - `ponswarp-signaling-rs/src/config.rs` auth, admin, billing, room, TURN, cloud 설정 구조
- 접근 가능한 문서와 코드 이상의 비공개 운영 사실은 추가하지 않았다.

## HTML QA
- `html/post-36.html`은 `<div>` fragment로 작성했으며 full HTML 문서가 아니다.
- 인라인 스타일, figure, figcaption, 노란 인사이트 박스, 파란 정보 박스, 다크 코드 참조 박스를 기존 post-30 패턴에 맞췄다.
- SVG 3개를 base64 data URI로 임베드했다.
- Markdown fence는 사용하지 않았다.

## Visual QA
- 생성한 SVG 3개:
  - `assets/post-36/server-weight-map.svg` — 매치메이커에서 제품 백엔드로 늘어난 책임 지도
  - `assets/post-36/server-flow-map.svg` — AppState, 라우터, TURN/R2/billing 시스템 흐름
  - `assets/post-36/server-timeline.svg` — TURN, Rust signaling, 배포 자동화, Cloud Drop, cleanup deadlock 시간축
- 각 SVG는 HTML에 data URI로 포함되어 있으며, 본문 설명과 직접 연결된다.

## Publish readiness
- Status: REVISE
- 이유: 초안, HTML fragment, QA, SVG asset은 준비됐지만 Tistory live publish 및 실제 게시 화면 검수는 아직 존재하지 않는다.
