# post-31 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-31.txt`
- HTML: `content/ponswarp-retrospective/html/post-31.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-31/serverless-half-truth.svg`
  - `content/ponswarp-retrospective/assets/post-31/control-plane-data-plane.svg`
  - `content/ponswarp-retrospective/assets/post-31/backend-responsibility-growth.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 “서버에 파일을 올리지 않는다”와 “서버가 필요 없다”의 차이를 문제로 제시한다.
- 본문이 당시 제품 상태, 서버 책임, control/data plane 분리, 실패 지점, Cloud Drop으로 이어진 판단, 회고 기준, 읽은 코드로 구성된다.
- `읽은 코드와 근거` 구간이 존재한다.
- Season 4의 첫 글로서 post-09의 TURN/mobile 현실과 post-30의 계층 분리 흐름을 서버 책임 주제로 이어 받는다.

## 톤 QA

- 결과: PASS
- `~합니다` 체 유지
- 금지 표현인 `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, `시사하는 바가 크다`를 사용하지 않았다.
- P2P를 부정하지 않고, 파일 저장 경로와 서버 운영 책임의 경계를 차분히 분리한다.
- 서버 책임을 과장해 “항상 서버 전송”처럼 쓰지 않고, direct transfer가 성립하는 조건도 함께 설명한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `4efb394 feat: 모든 호스트 허용 및 추가 stun 서버 적용`
  - `2def330 feat: TURN 서버 설정을 동적으로 가져와 모바일 WebRTC 연결 안정화`
  - `44fb5ad feat(server): Rust 기반 시그널링 서버 초기 구현`
  - `b834716 feat: 시그널링 서버 안정성 향상 및 배포 자동화 추가`
  - `4847872 Enable async cloud drops for delayed downloads`
  - `3628858 Make Cloud Drop large uploads resumable by parts`
  - `f1c69cb fix: prevent signaling room cleanup deadlocks`
- 코드 앵커:
  - `PonsWarp/src/services/signaling-adapter.ts`
  - `PonsWarp/src/services/webRTCService.ts`
  - `PonsWarp/src/services/swarmManager.ts`
  - `ponswarp-signaling-rs/src/main.rs`
  - `ponswarp-signaling-rs/src/handlers/turn.rs`
  - `PonsWarp/src/components/SenderView.tsx`
  - `PonsWarp/src/components/ReceiverView.tsx`
  - `PonsWarp/src/components/CloudSenderView.tsx`
- 보수성:
  - 현재 작업공간에는 PonsWarp 원본 저장소가 없으므로, `series-plan.md`, `evidence-index.md`, 완료된 post-09/post-30의 문맥 안에서만 주장했다.
  - 성능 수치, 운영 비용 수치, 공개 URL, 실제 배포 결과를 새로 만들지 않았다.
  - TURN, cleanup, Cloud Drop은 이미 문서화된 커밋과 시리즈 근거 범위에서만 다뤘다.

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
- control plane과 data plane 분리를 통해 P2P 제품의 서버 책임을 설명한다.
- direct transfer, TURN relay, Cloud Drop을 경쟁 관계가 아니라 조건별 전달 계약으로 정리한다.

## HTML QA

- 결과: PASS
- Tistory 본문 fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼를 포함하지 않는다.
- 마크다운 fence 없음
- figure, figcaption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- HTML은 `content/ponswarp-retrospective/html/post-31.html`에 생성됨

## 시각 자료 QA

- 결과: PASS
- `serverless-half-truth.svg`는 direct data path와 signaling/TURN 경로의 차이를 설명한다.
- `control-plane-data-plane.svg`는 room/offer/ICE/TURN credential과 chunk/DataChannel/write 흐름을 분리한다.
- `backend-responsibility-growth.svg`는 signaling 중매에서 TURN, cleanup, readiness, Cloud Drop 운영 책임으로 커진 흐름을 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 실제 Tistory 렌더링 확인 전
  - publish manifest 미작성
  - 카테고리 및 공개 URL 미확정
  - 라이브 publish가 아직 존재하지 않음

## 총평

post-31은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. “서버 없는 전송”을 파일 저장 경로의 장점으로 인정하면서도, signaling, TURN, cleanup, Cloud Drop이 제품 신뢰의 서버 책임으로 커진 과정을 보수적으로 설명한다. 라이브 발행 전에는 manifest 반영, 카테고리 확정, Tistory 렌더링 검증이 필요하므로 publish readiness는 REVISE로 둔다.
