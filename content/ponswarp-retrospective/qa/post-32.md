# post-32 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-32.txt`
- HTML: `content/ponswarp-retrospective/html/post-32.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-32/signal-to-rs-boundary.svg`
  - `content/ponswarp-retrospective/assets/post-32/signaling-runtime-flow.svg`
  - `content/ponswarp-retrospective/assets/post-32/backend-productization-layers.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 “서버 없이 브라우저끼리 파일을 보낸다”는 문장의 절반만 맞는 지점을 문제로 제시한다.
- 본문은 서버 없는 전송의 빈칸, `ponswarp-signaling-rs` 분기점, 런타임 플로우, TURN/cleanup/readiness, 제품 정책과 Cloud Drop, 회고 판단으로 나뉜다.
- 기본 골격의 문제 제기, 당시 제품 상태, 시스템 구조, 실제 실패 지점, 설계 변경, 지금 돌아보는 판단, 읽은 코드/근거가 모두 포함되어 있다.
- post-31의 서버 책임 주제를 이어 받아 Season 4의 백엔드 현실화 흐름으로 연결한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음: `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, `시사하는 바가 크다` 미사용.
- `~합니다` 체 중심으로 유지했다.
- 언어 교체나 Rust 찬양으로 단순화하지 않고, P2P 제품에서 서버가 맡아야 하는 책임 경계를 설명한다.
- “서버 없는 전송”이라는 제품 문장을 부정하지 않고, 파일 바이트와 연결/운영 책임을 분리해 보수적으로 정리했다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `44fb5ad feat(server): Rust 기반 시그널링 서버 초기 구현`
  - `b834716 feat: 시그널링 서버 안정성 향상 및 배포 자동화 추가`
  - `f1c69cb fix: prevent signaling room cleanup deadlocks`
  - `2def330 feat: TURN 서버 설정을 동적으로 가져와 모바일 WebRTC 연결 안정화`
  - `4847872 Enable async cloud drops for delayed downloads`
  - `b6f3ea8 Add a first-class Cloud Drop pricing page`
  - `f8f2120 Issue Cloud Drop entitlements from Stripe Checkout`
  - `2e4593d Route Cloud Drop billing through PayPal`
  - `3628858 Make Cloud Drop large uploads resumable by parts`
  - `a004c91 Expose the Free plan as a first-class cloud policy`
  - `212d751 Disable gated account and billing surfaces`
- 문서 앵커:
  - `content/ponswarp-retrospective/series-plan.md`
  - `content/ponswarp-retrospective/evidence-index.md`
- 보수성:
  - 현재 작업공간에는 PonsWarp 원본 저장소가 없으므로, 계획 문서와 증거 인덱스에 있는 커밋/구성 범위 안에서만 주장했다.
  - `auth`, `billing`, `database`, `Cloud Drop`은 구성과 커밋 흐름으로만 언급하고 내부 구현 세부를 새로 만들지 않았다.
  - 운영 URL, 성능 수치, 실제 배포 지표, 사용량 수치를 invent하지 않았다.

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
- `ponswarp-signal`을 초기 연결 보조 서버로, `ponswarp-signaling-rs`를 `/ws`, `/health`, `/ready`, state, cleanup, auth/billing/database까지 포함하는 제품 백엔드 경계로 비교했다.
- 파일 바이트는 브라우저/DataChannel/WASM 코어가 맡고, 연결 중개와 운영 상태는 signaling 서버가 맡는 책임 분리를 명시했다.

## HTML QA

- 결과: PASS
- Tistory 본문 fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼를 포함하지 않는다.
- 마크다운 fence 없음.
- figure 3개, caption 3개, info box, insight box, blockquote, code reference box 포함.
- 이미지 3개가 base64 data URI로 실제 삽입되어 있다.

## 시각 자료 QA

- 결과: PASS
- `signal-to-rs-boundary.svg`는 `ponswarp-signal`과 `ponswarp-signaling-rs`의 책임 경계 변화를 설명한다.
- `signaling-runtime-flow.svg`는 sender, `/ws signaling`, receiver, WebRTC DataChannel, 서버 책임/비책임을 보여준다.
- `backend-productization-layers.svg`는 protocol/state, operations, product policy, Cloud Drop으로 두꺼워진 백엔드 층을 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 실제 Tistory 렌더링 확인 전이다.
  - publish manifest를 의도적으로 수정하지 않았다.
  - 카테고리와 공개 URL이 아직 없다.
  - live publish가 존재하지 않는다.

## 총평

post-32는 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. `ponswarp-signal`에서 `ponswarp-signaling-rs`로 넘어간 변화를 언어 교체가 아니라 P2P 제품의 서버 책임 경계가 명확해진 사건으로 정리한다. 발행 전에는 Tistory 렌더링, 카테고리, manifest, 공개 URL 확인이 추가로 필요하므로 publish readiness는 REVISE로 둔다.
