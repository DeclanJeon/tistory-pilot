# post-18 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-18.txt`
- HTML: `content/ponswarp-retrospective/html/post-18.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-18/lan-assumption-shift.svg`
  - `content/ponswarp-retrospective/assets/post-18/lan-control-loop.svg`
  - `content/ponswarp-retrospective/assets/post-18/lan-product-expectation.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 일반 전송 튜닝이 이미 있었는데도 LAN 최적화가 별도로 필요했던 질문을 제시한다.
- 본문이 일반 튜닝의 한계, LAN 가정 변화, chunk/batch 판단, channel/buffering 기대, 제품 기대 변화로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-17의 RTT 적응형 제어 이후 post-19의 파일 손상/재정렬 문제로 이어질 수 있도록 LAN 최적화를 성능과 무결성 사이의 균형 문제로 배치했다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색은 별도 자동화 없이 수동 검토했다.
- `~합니다` 체 유지
- LAN을 마법 같은 고속 모드로 과장하지 않고, 큐 상한과 저장 압력을 함께 다루는 보수적 회고로 작성했다.
- 코드 근거가 없는 수치나 벤치마크 결과를 새로 만들지 않았다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - post-18 전용 커밋 해시는 evidence index에 직접 분리되어 있지 않아 사용하지 않았다.
  - 근거는 현재 코드와 시리즈 계획의 확인 가능한 앵커로 제한했다.
- 코드 앵커:
  - `PonsWarp/src/utils/constants.ts:15-47`
  - `PonsWarp/src/services/networkAdaptiveController.ts:38-152`
  - `PonsWarp/src/services/swarmManager.ts:733-817`
  - `PonsWarp/src/workers/file-sender.worker.ts:138-146,251-267,563-625`
  - `PonsWarp/src/services/reorderingBuffer.ts:6-10`
  - `content/ponswarp-retrospective/series-plan.md:196-207,261-270`
- 보수적 처리:
  - 실제 LAN 벤치마크 수치, 특정 커밋 성능 결과, 라이브 Tistory 렌더링 결과는 확인하지 않았으므로 본문에 단정하지 않았다.
  - “LAN 최적화”를 큰 큐/멀티 채널 확대가 아니라 현재 코드의 LAN/localhost poll 지연 주석과 bounded queue 정책으로 해석했다.

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
- LAN에서 네트워크 가정이 짧은 RTT와 높은 사용자 기대 쪽으로 바뀌며, 작은 scheduler/poll 지연이 제품 체감 문제로 커진다는 점을 설명한다.
- chunk/channel/buffering 판단이 단순 속도 최적화가 아니라 receiver 저장 압력과 완료 신뢰를 지키는 문제였음을 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- Tistory 본문 fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼를 포함하지 않는다.
- figure, caption, info box, insight box, blockquote, code reference box 포함
- SVG 이미지 3개가 base64 data URI로 실제 삽입됨

## 시각 자료 QA

- 결과: PASS
- `lan-assumption-shift.svg`는 일반 인터넷 경로와 빠른 LAN/localhost에서 병목 가정이 달라지는 점을 비교한다.
- `lan-control-loop.svg`는 bounded queue, 단일-flight batch, partition 대기, 짧은 wake-up 경로를 보여 준다.
- `lan-product-expectation.svg`는 LAN에서 chunk, channel/buffer, 제품 기대가 함께 바뀌는 점을 설명한다.
- 세 SVG 모두 HTML에 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 라이브 LAN 전송 재현 evidence는 포함하지 않았고 코드/시리즈 문서 근거만 사용했다.

## 총평

post-18은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. LAN 최적화를 단순 고속 모드가 아니라 짧은 poll 대기, drain/ACK wake-up, bounded queue, receiver 저장 압력 사이의 균형 문제로 설명한다. 발행 직전 단계에서는 manifest 작성, 카테고리 확인, 실제 Tistory 렌더링 QA가 추가로 필요하다.
