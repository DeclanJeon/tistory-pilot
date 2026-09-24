# post-09 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-09.txt`
- HTML: `content/ponswarp-retrospective/html/post-09.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-09/mobile-nat-reality.svg`
  - `content/ponswarp-retrospective/assets/post-09/turn-cost-vs-reliability.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 모바일 NAT와 TURN 필요성을 바로 제시한다.
- 본문이 문제 제기, 제품 구조, 커밋 근거, 실패 양상, 운영 비용, Cloud Drop 연결, UI 상태 설계, 회고 판단으로 이어진다.
- `읽은 코드` 구간이 존재한다.
- post-08의 저장 완료 신뢰 문제에서 post-10의 push/AIMD 제어로 넘어가기 전, 연결 안정성 문제를 독립 주제로 다룬다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- 프로토콜 설명보다 제품 판단과 운영 책임을 중심에 둔다.
- 성공담으로 과장하지 않고 TURN 비용과 서버 없는 전송 문장의 한계를 함께 설명한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `4efb394`
  - `2def330`
  - `7393c8f`
  - `0b4b007`
  - `44fb5ad`
  - `b834716`
  - `4847872`
  - `8f7299d`
- 코드 앵커:
  - `PonsWarp/src/services/webRTCService.ts:90-97`
  - `PonsWarp/src/services/webRTCService.ts:250-258`
  - `PonsWarp/src/services/webRTCService.ts:429-487`
  - `PonsWarp/src/services/swarmManager.ts:2231-2236`
  - `PonsWarp/src/utils/mobileResumePolicy.ts:11-28`
  - `ponswarp-signaling-rs/src/handlers/turn.rs:15-49`
  - `ponswarp-signaling-rs/src/handlers/turn.rs:80-158`

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - TURN credential / ICE server 핵심 로직
  - 모바일 background resume 정책
  - 운영/배포 비용 관점
  - Cloud Drop으로 이어지는 제품 판단 변화

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- Tistory-ready body fragment 형식
- figure, caption, info box, insight box, code reference box 포함
- 이미지 2개가 data URI로 실제 삽입됨

## 시각 자료 QA

- 결과: PASS
- 모바일 NAT 현실 도식 포함
- TURN 비용과 신뢰 교환 도식 포함
- 두 SVG 모두 밝은 editorial diagram 스타일이며 장식보다 설명에 초점을 둔다.
- 캡션 포함

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 공개 페이지 기준 최종 렌더링 확인 전

## 총평

post-09는 초안과 HTML 기준으로 발행 가능한 밀도에 도달했다. TURN을 단순 프로토콜 설명으로 소비하지 않고, 모바일 사용자를 정상 사용자로 받아들이는 순간 생기는 제품 구조와 운영 비용의 변화로 설명한다. 다만 실제 발행 전에는 시리즈 manifest 반영과 Tistory 렌더링 확인이 필요하다.
