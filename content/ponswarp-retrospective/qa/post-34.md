# Post 34 QA — TURN, room cleanup, deadlock, protocol edge case

## Structure QA

- 기본 골격 확인: 문제 제기, 당시 제품 상태, 시스템 구조, 실제 실패 지점, 설계 변경, 지금 돌아보는 판단, 읽은 코드 흐름을 포함했다.
- 서비스 분석 요소: 프로젝트 구성, 기술 스택, 사용자 플로우, 시스템 플로우, 기능 구조, 핵심 로직, 운영 관점, 제품 판단 변화를 포함했다.
- post-34 주제인 TURN, room cleanup, deadlock, protocol edge case를 각각 독립 섹션과 연결 서사로 다뤘다.

## Tone QA

- 한국어 `~합니다` 체를 유지했다.
- 기존 시리즈처럼 기능 자랑보다 실패 지점과 판단 변화를 중심에 두었다.
- 금지 표현인 `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, `시사하는 바가 크다`를 사용하지 않았다.
- AI식 요약 문장 대신 코드와 커밋이 만든 제품 판단을 문단으로 설명했다.

## Evidence QA

- 근거 파일: `content/ponswarp-retrospective/series-plan.md`, `content/ponswarp-retrospective/evidence-index.md`.
- 근거 코드: `/home/declan/Documents/Develop/Project/ponswarp/ponswarp-signaling-rs/src/handlers/turn.rs`, `src/handlers/room.rs`, `src/protocol/messages.rs`.
- 근거 커밋: `2def330`, `44fb5ad`, `b834716`, `df0a6dc`, `3697ece`, `f1c69cb`.
- 보수성 확인: TURN, fallback URL, STUN credential 생략, DashMap guard scope, protocol serialization tests처럼 코드와 커밋에서 확인되는 범위만 서술했다. 확인되지 않은 트래픽 수치, 장애 규모, 사용자 수는 쓰지 않았다.

## HTML QA

- `html/post-34.html`은 `<html>`, `<head>`, `<body>` 없는 Tistory-ready fragment다.
- SVG 3개를 `data:image/svg+xml;base64,...` 형태로 인라인 임베드했다.
- 코드 표기는 fragment 안에서 backtick markdown이 아니라 inline text/code-style 문맥으로 처리했다.
- 외부 이미지 URL이나 스크립트를 사용하지 않았다.

## Visual QA

- `assets/post-34/turn-credential-boundary.svg`: TURN credential 생성, ICE fallback, STUN/TURN 역할 차이를 설명한다.
- `assets/post-34/room-cleanup-deadlock.svg`: lock 보유 상태에서 await/broadcast를 호출하는 위험과 guard scope 축소 후 흐름을 대비한다.
- `assets/post-34/protocol-edge-cases.svg`: Manifest target, TURN credential omission, RoomUsers 상태가 클라이언트 실패 분류와 연결되는 구조를 설명한다.
- 모든 SVG는 장식이 아니라 본문 이해를 돕는 구조도다.

## Publish readiness

- Status: REVISE
- Reason: 초안, HTML fragment, QA, SVG 자산은 준비되었지만 Tistory 라이브 발행 및 실게시 렌더링 확인은 아직 없다.
