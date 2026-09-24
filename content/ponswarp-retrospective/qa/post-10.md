# post-10 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-10.txt`
- HTML: `content/ponswarp-retrospective/html/post-10.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-10/push-vs-pull-flow.svg`
  - `content/ponswarp-retrospective/assets/post-10/aimd-control-loop.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 Push 방식과 AIMD를 붙이게 된 제품 문제를 제시한다.
- 본문이 Pull 한계, Push 전환, AIMD 제어, 시스템 구조, 판단 회고, 사용자 체감으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-09 이후 성능/연결 현실에서 post-11 무결성 문제로 자연스럽게 이어진다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- 영웅 서사보다 시행착오와 보수화된 후속 판단을 설명한다.
- AI식 균일 문단 구조를 피하고 짧은 판단 문장과 긴 분석 문장을 섞었다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `6e635f3 feat: 전송 성능 최적화를 위한 Push 방식 도입 및 AIMD 혼잡 제어 알고리즘 구현`
  - `2def330 feat: TURN 서버 설정을 동적으로 가져와 모바일 WebRTC 연결 안정화`
  - `6fdd593 fix: 파일 전송 시스템 안정화 및 대용량 파일 지원`
  - `54cf5f4 feat: 수신 측 역압(Backpressure) 제어 구현`
  - `09161ce feat: RTT 기반 동적 혼잡 제어 알고리즘`
- 코드 앵커:
  - `PonsWarp/workers/file-sender.worker.v1.ts` at `6e635f3`
  - `PonsWarp/services/webRTCService.ts` at `6e635f3`
  - `PonsWarp/src/services/networkAdaptiveController.ts:38-215`
  - `PonsWarp/src/services/swarmManager.ts:756-817`
  - `PonsWarp/src/utils/constants.ts:18-29`

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 핵심 로직
  - 알고리즘
  - 제품 판단 변화
- Push 방식이 사용자의 진행률 체감에 미친 영향을 설명한다.
- AIMD가 단순 속도 기능이 아니라 브라우저 큐와 RTT를 다루는 안전장치였음을 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 2개가 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `push-vs-pull-flow.svg`는 Pull 요청 흐름과 Push window 흐름을 비교한다.
- `aimd-control-loop.svg`는 RTT/buffer 샘플링, 혼잡 판단, 곱셈 감소, 덧셈 증가, 배치 재계산 루프를 보여 준다.
- 두 SVG 모두 밝은 editorial 다이어그램 스타일이며 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전

## 총평

post-10은 초안과 HTML 기준으로 발행 가능한 수준의 구조를 갖췄다. Push 전환과 AIMD 제어를 성능 숫자만이 아니라 사용자 체감, 브라우저 큐, receiver 저장 압력으로 연결해 설명한다. 발행 직전 단계에서는 manifest와 공개 렌더링 검증이 추가로 필요하다.
