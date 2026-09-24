# post-33 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-33.txt`
- HTML: `content/ponswarp-retrospective/html/post-33.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-33/server-boundary.svg`
  - `content/ponswarp-retrospective/assets/post-33/protocol-flow.svg`
  - `content/ponswarp-retrospective/assets/post-33/operational-stack.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 “서버 없는 전송”이라는 제품 문장이 숨기는 signaling 책임을 문제로 제시한다.
- 본문은 서버 없는 전송의 빈칸, Rust 서버의 실제 책임, 브라우저 어댑터 전환 비용, Rust 선택의 의미, 제품 구조, 과장 방지, 회고 판단으로 구성했다.
- `읽은 코드` 구간이 존재한다.
- Season 4의 흐름에 맞춰 post-31/32의 서버 재해석 다음 단계인 “왜 별도 Rust signaling 서버인가”를 다룬다.

## 톤 QA

- 결과: PASS
- 시리즈 계획에서 금지한 요약형·교훈형 상투 문구 4종을 사용하지 않았다.
- `~합니다` 체를 유지했다.
- Rust 서버를 성능 만능론으로 설명하지 않고, P2P 제품의 만남·운영·실패 설명 경계로 설명했다.
- “서버 없는 전송”을 완전히 부정하지 않고, 파일 서버 없음과 서버 책임 없음의 차이를 보수적으로 구분했다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `2025-12-10 44fb5ad feat(server): Rust 기반 시그널링 서버 초기 구현`
  - `2025-12-11 b834716 feat: 시그널링 서버 안정성 향상 및 배포 자동화 추가`
  - `2026-05-17 f1c69cb fix: prevent signaling room cleanup deadlocks`
- 코드 앵커:
  - `ponswarp-signaling-rs/src/main.rs`
  - `ponswarp-signaling-rs/src/protocol/messages.rs`
  - `ponswarp-signaling-rs/src/state.rs`
  - `ponswarp-signaling-rs/src/handlers/room.rs`
  - `PonsWarp/src/services/signaling-adapter.ts`
  - `content/ponswarp-retrospective/evidence-index.md`
- 보수성:
  - signaling 서버가 파일 바이트를 운반한다고 쓰지 않았다.
  - signaling CPU 성능 수치나 벤치마크를 새로 만들지 않았다.
  - Cloud Drop, billing, auth/admin 라우트는 현재 `main.rs`에 보이는 운영 표면으로만 언급했다.
  - deadlock 관련 설명은 `room.rs` 주석과 `f1c69cb` 근거 범위 안에서만 다뤘다.

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
- 네 층 구조(UI, WebRTC/worker, Rust/WASM core, Rust signaling server)를 통해 제품 경계를 설명했다.
- `/ws`, `/health`, `/ready`, room/peer state, cleanup scheduler, TURN config, Cloud Drop/billing 라우트로 운영 표면을 설명했다.

## HTML QA

- 결과: PASS
- Tistory 본문 fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼를 포함하지 않는다.
- 마크다운 fence 없음.
- figure, figcaption, info box, blockquote, code reference box 포함.
- SVG 3개가 base64 data URI로 삽입되어 있다.

## 시각 자료 QA

- 결과: PASS
- `server-boundary.svg`는 Browser A/B, Rust Signal, P2P DataChannel의 책임 경계를 설명한다.
- `protocol-flow.svg`는 JoinRoom, RoomUsers/PeerJoined, Offer/Answer/ICE/TURN 흐름을 설명한다.
- `operational-stack.svg`는 매치메이커 기대에서 readiness, cleanup, Cloud Drop, billing 운영 표면으로 확장된 서버 책임을 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 실제 Tistory 렌더링 확인 전이다.
  - publish manifest를 갱신하지 않았다. 이번 작업 범위에서 manifest 수정은 금지되어 있다.
  - 카테고리와 공개 URL이 아직 확정되지 않았다.
  - live publish가 존재하지 않는다.

## 총평

post-33은 초안, HTML fragment, QA, SVG asset 기준으로 발행 전 검토 가능한 상태다. 다만 실제 Tistory 발행과 렌더링 확인, manifest 반영은 이번 범위 밖이므로 publish readiness는 REVISE로 둔다.
