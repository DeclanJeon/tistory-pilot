# Post 41 QA — QUIC와 native streaming이 더 좋아 보였던 이유

## 산출물

- Draft: `content/ponswarp-retrospective/drafts/post-41.txt`
- HTML: `content/ponswarp-retrospective/html/post-41.html`
- QA: `content/ponswarp-retrospective/qa/post-41.md`
- Assets:
  - `content/ponswarp-retrospective/assets/post-41/native-streaming-stack.svg`
  - `content/ponswarp-retrospective/assets/post-41/quic-stream-map.svg`
  - `content/ponswarp-retrospective/assets/post-41/web-to-desktop-decision.svg`

## 구조 QA

- 시리즈 기본 골격을 따른다: 문제 제기, 당시 제품 상태, 시스템 구조, 실제 실패/마찰 지점, 설계 변경 유혹, 지금 돌아보는 판단, 읽은 코드와 근거.
- 서비스 분석 항목을 포함한다: 프로젝트 구성, 기술 스택, 사용자/시스템 플로우, 기능 구조, 핵심 로직, 운영 관점, 제품 판단 변화.
- Season 5 데스크톱 분기의 post-41 주제에 맞게 QUIC/native streaming이 “왜 좋아 보였는지”에 초점을 맞춘다.
- post-42에서 다룰 수 있는 stall/생존 실패를 선점해서 단정하지 않고, 이 글은 판단 당시의 구조적 매력에 제한한다.

## 톤 QA

- 한국어 `~합니다` 체를 유지한다.
- “WebRTC는 나쁘고 QUIC가 정답” 같은 기술 승리담으로 쓰지 않았다.
- “좋아 보였다”와 “검증됐다”를 분리해 과장하지 않았다.
- 시리즈 금지 표현을 본문에 사용하지 않았다.
- AI식 요약 문장 대신 기존 시리즈처럼 실패 압력과 판단 변화를 따라가는 회고 톤을 유지했다.

## 근거 QA

- 근거로 사용한 문서:
  - `series-plan.md:101-159` — 4층 구조(Product/UI, Browser transfer engine, Storage and recovery, Core and backend)
  - `series-plan.md:208-233` — core 분리, Rust signaling, ponswarp-desktop created, native / QUIC / Tauri hope, later stall
  - `series-plan.md:293-297` — Season 5 post-39~42 배치
  - `evidence-index.md:28-32` — ponswarp-desktop created, 관찰 포인트, late visible activity
  - `evidence-index.md:44-92` — WebRTC/TURN/대용량 저장/손상/backpressure/WASM/Rust signaling 근거
  - 기존 draft post-16, post-22, post-30 — backpressure, 무결성 우선, Rust/WASM core 경계
- 최소 3개 이상의 실제 커밋/시점 근거를 사용했다: 2025-11-20 초기 WebRTC/대용량/로깅 흐름, 2025-11-21 AIMD/TURN, 2025-12-04 pons-core-wasm, 2025-12-10 Rust signaling, 2025-12-17 ponswarp-desktop.
- ponswarp-desktop의 내부 구현 세부사항, 성능 수치, QUIC 전송 성공 사례, native streaming의 완성도를 새로 만들지 않았다.
- QUIC가 NAT/운영/무결성을 자동 해결한다고 쓰지 않았다.

## HTML QA

- `html/post-41.html`은 `<article>` fragment이며 `html`, `head`, `body`를 포함하지 않는다.
- Tistory 본문에 붙여 넣기 쉬운 inline style 기반 구조다.
- SVG 3개가 모두 `data:image/svg+xml;base64,...` 형식으로 임베드되어 있다.
- 코드/파일 경로 표기는 `<code>` 스타일로 처리했다.
- Markdown fence는 포함하지 않았다.

## Visual QA

- `native-streaming-stack.svg`: 브라우저 WebRTC 경로와 native desktop 경로의 책임층을 비교한다.
- `quic-stream-map.svg`: QUIC stream 모델이 control/file/resume-check 분리를 제공할 것처럼 보였던 이유를 설명한다.
- `web-to-desktop-decision.svg`: 브라우저 현실, core hardening, server reality가 desktop hope로 이어지는 압력 흐름을 설명한다.
- 세 SVG 모두 독립 파일로 존재하며, HTML에는 base64 data URI로 임베드되어 있다.
- 이미지는 장식이 아니라 본문 설명을 보조하는 구조도다.

## Publish readiness

REVISE — 본문, HTML, SVG, QA 산출물은 준비되었지만 live publish 및 실제 Tistory 렌더링 검수는 아직 수행되지 않았다.
