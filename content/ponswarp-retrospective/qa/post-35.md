# Post 35 QA — signaling 서버가 제품 신뢰를 좌우한 순간

## Structure QA
- 기본 골격 확인: 문제 제기, 당시 제품 상태, 시스템 구조, 사용자/서버 플로우, 실제 실패 지점, 설계 변경, 지금 돌아보는 판단, 읽은 코드 포함.
- 서비스 분석 요소 확인: 프로젝트 구성, 기술 스택, 사용자 플로우, 시스템 플로우, 기능 구조, 운영/배포 관점, 제품 판단 변화 포함.
- Season 4 흐름 확인: post-31~38의 서버 현실화 구간 중 post-35 주제인 signaling 신뢰성에 집중하고, manifest나 다른 post는 수정하지 않음.

## Tone QA
- 한국어 `~합니다` 체 유지.
- 금지 표현 목록은 본문/HTML에서 미사용 확인.
- 회고 톤과 서비스 분석 톤을 함께 유지: “서버가 파일을 나르지 않아도 제품 신뢰를 나른다”는 판단을 과장 없이 서술.

## Evidence QA
- 근거 파일: `content/ponswarp-retrospective/series-plan.md`, `content/ponswarp-retrospective/evidence-index.md`.
- 코드 근거: `/home/declan/Documents/Develop/Project/ponswarp/ponswarp-signaling-rs/src/main.rs`, `handlers/room.rs`, `handlers/signaling.rs`, `handlers/turn.rs`, `protocol/messages.rs`.
- 커밋 근거: `44fb5ad`, `b834716`, `df0a6dc`, `3697ece`, `f1c69cb`, 보조 맥락으로 `2def330` 사용.
- 검증된 범위 밖의 내부 구현 세부사항은 단정하지 않았고, 파일 바이트가 signaling 서버를 지나가지 않는다는 구조적 경계만 설명함.

## HTML QA
- `html/post-35.html`은 `<div>` 기반 Tistory-ready fragment이며 full HTML document가 아님.
- 3개 SVG가 `data:image/svg+xml;base64,` URI로 embed됨.
- Markdown fence 없음.
- 인라인 스타일과 `<code>`, `<figure>`, `<figcaption>`, `<blockquote>` 패턴은 기존 post-30 HTML conventions를 따름.

## Visual QA
- `assets/post-35/signaling-trust-path.svg`: Sender–Signaling–Receiver 신뢰 경로 설명.
- `assets/post-35/signaling-sequence.svg`: join/offer/answer/ICE 후 P2P DataChannel로 넘어가는 sequence 설명.
- `assets/post-35/server-reliability-gates.svg`: deadlock, ICE fallback, readiness, protocol edge case가 제품 신뢰로 이어지는 구조 설명.
- SVG 3개 모두 설명용이며 장식 목적 아님.

## Publish readiness
- Status: REVISE
- Reason: Draft/html/assets/QA는 작성 완료됐지만, Tistory live publish 및 실제 게시 화면 QA가 아직 존재하지 않음.
