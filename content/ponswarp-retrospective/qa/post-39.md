# post-39 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-39.txt`
- HTML: `content/ponswarp-retrospective/html/post-39.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-39/browser-pressure-map.svg`
  - `content/ponswarp-retrospective/assets/post-39/desktop-temptation.svg`
  - `content/ponswarp-retrospective/assets/post-39/decision-flow.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 “웹을 포기하고 싶었던 날”의 감정을 제품/플랫폼 판단 질문으로 전환한다.
- 본문은 당시 제품 상태, 웹의 압력, 데스크톱 분기의 유혹, 플랫폼 변경으로 사라지는 것과 남는 것, 판단 기준, 회고 판단으로 구성된다.
- `읽은 코드와 근거` 구간이 존재한다.
- Season 4 서버 운영 구간에서 Season 5 데스크톱 분기로 넘어가는 연결부 역할을 한다.

## 톤 QA

- 결과: PASS
- 시리즈 금지 문구 4종을 본문/HTML에서 사용하지 않았다.
- `~합니다` 체를 유지한다.
- 데스크톱을 정답처럼 과장하지 않고, 웹에 대한 피로와 제품 판단을 분리한다.
- “웹은 한계였지만 제품 표면이었다”는 균형을 유지한다.

## 근거 QA

- 결과: PASS
- 사용 근거:
  - `content/ponswarp-retrospective/series-plan.md` — Season 5 post-39~42 배치
  - `content/ponswarp-retrospective/evidence-index.md` — `ponswarp-desktop` created `2025-12-17`, `native / QUIC / Tauri`, late visible activity `2026-02-18`
  - `638bc83 feat: 대용량 파일 다운로드 시 메모리 폭발 방지 기능 추가`
  - `6e635f3 feat: 전송 성능 최적화를 위한 Push 방식 도입 및 AIMD 혼잡 제어 알고리즘 구현`
  - `2def330 feat: TURN 서버 설정을 동적으로 가져와 모바일 WebRTC 연결 안정화`
  - `21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
  - `54cf5f4 feat: 수신 측 역압(Backpressure) 제어 구현`
  - `09161ce feat: RTT 기반 동적 혼잡 제어 알고리즘`
  - `15aef19`, `1b6fb15`, `e589cf2`, `7fe0ca1` — pons-core-wasm 바이트 계약 흐름
  - `44fb5ad`, `b834716`, `f1c69cb` — signaling 서버와 운영 책임 흐름
- 보수성:
  - 현재 작업공간에는 원본 PonsWarp/desktop 저장소가 없으므로, `series-plan.md`와 `evidence-index.md` 및 앞선 시리즈 소재에 기록된 사실만 사용했다.
  - `ponswarp-desktop`의 세부 구현, 성능 수치, QUIC 구현 완료 여부, 배포 결과를 새로 만들지 않았다.
  - native / QUIC / Tauri는 evidence-index의 관찰 포인트이자 당시 매력으로만 언급했다.

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
- 웹 경로의 UI, WebRTC, storage, trust 계층과 데스크톱 분기의 native streaming, QUIC, Tauri 유혹을 비교한다.
- 플랫폼 변경이 신뢰·복구·운영·배포 책임을 제거하지 않는다는 점을 명시한다.

## HTML QA

- 결과: PASS
- Tistory-ready fragment이며 전체 HTML 문서 래퍼를 포함하지 않는다.
- 마크다운 fence 없음.
- figure, figcaption, info box, blockquote, code reference box 포함.
- 이미지 3개가 base64 data URI로 삽입됨.

## 시각 자료 QA

- 결과: PASS
- `browser-pressure-map.svg`는 Browser UI, WebRTC, Storage, Trust 계층에서 웹 포기 압력이 생긴 구조를 설명한다.
- `desktop-temptation.svg`는 Web Path와 Desktop Temptation을 비교하고 native / QUIC / Tauri 유혹을 보여준다.
- `decision-flow.svg`는 피로 → 탈출 상상 → 재질문 → 분기 유지 흐름을 설명한다.
- 세 SVG 모두 HTML에 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음
  - live publish 미실행
  - publish manifest는 assignment 범위 밖이라 수정하지 않음

## 총평

post-39는 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. 웹을 포기하고 싶었던 감정을 플랫폼 비난으로 끝내지 않고, 브라우저 전송의 권한·네트워크·저장·무결성 압력과 데스크톱 분기의 제품적 유혹을 비교한다. 발행 상태는 live publish가 없으므로 REVISE로 둔다.
