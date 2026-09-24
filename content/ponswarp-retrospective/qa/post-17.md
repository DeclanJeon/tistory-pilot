# post-17 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-17.txt`
- HTML: `content/ponswarp-retrospective/html/post-17.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-17/control-sequence.svg`
  - `content/ponswarp-retrospective/assets/post-17/rtt-signal-loop.svg`
  - `content/ponswarp-retrospective/assets/post-17/transfer-stability.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 Push/AIMD 이후 RTT 기반 적응형 제어가 필요해진 이유를 제시한다.
- 본문이 Push/AIMD 뒤의 빈칸, 샘플링 신호, window/batch 제어 루프, sampling/drain 리듬, 사용자 체감, 현재 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-16 backpressure 이후 post-18 LAN 최적화로 이어지는 성능/안정성 흐름에 맞는다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- 최고속도 개선으로 과장하지 않고, 보수화된 현재 constants까지 함께 설명한다.
- 영웅 서사보다 feedback system과 잘못된 신호의 위험을 중심으로 회고한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `09161ce feat: RTT 기반 동적 혼잡 제어 알고리즘을 구현하여 네트워크 적응형 전송 성능 개선`
  - `6e635f3 feat: 전송 성능 최적화를 위한 Push 방식 도입 및 AIMD 혼잡 제어 알고리즘 구현`은 선행 맥락으로만 사용
- 코드 앵커:
  - `PonsWarp/src/services/networkAdaptiveController.ts:38-215`
  - `PonsWarp/src/services/swarmManager.ts:756-817`
  - `PonsWarp/src/utils/constants.ts:11-29`
  - `PonsWarp/src/utils/constants.ts:39-43`
- 검증된 내용:
  - `currentRoundTripTime`을 ms 단위 RTT로 변환한다.
  - `availableOutgoingBitrate`를 bytes/sec 추정 대역폭으로 저장한다.
  - 최근 20개 RTT sample, `minRtt`, `estimatedRtt / minRtt` ratio를 사용한다.
  - `rttRatio > 2.0` 또는 `bufferedAmount > cwnd`이면 `cwnd * 0.7` 감소를 수행한다.
  - `rttRatio < 1.2` 및 `bufferedAmount < cwnd * 0.8`이면 `cwnd + 16KB` 증가를 수행한다.
  - `targetBatchBytes = cwnd * 0.2`로 batch를 계산하고 worker에 `update-adaptive-config`를 보낸다.
  - 현재 constants는 `BATCH_SIZE_MAX = 1`로 batch 확장을 보수적으로 제한한다.

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
- RTT 기반 제어가 Push/AIMD 다음 단계인 이유를 설명한다.
- 샘플링 신호와 batch/window 영향이 사용자-visible transfer stability로 이어지는 경로를 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, insight box, blockquote, code reference box 포함
- 이미지 3개가 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `control-sequence.svg`는 Push → AIMD → RTT adaptive control의 순서를 보여 준다.
- `rtt-signal-loop.svg`는 RTT/buffer 샘플링, 혼잡/여유 판단, cwnd 조정, batch 재계산 루프를 보여 준다.
- `transfer-stability.svg`는 사용자에게 보이는 진행률/전송 리듬 안정성 차이를 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - live publish evidence 없음

## 총평

post-17은 초안과 HTML 기준으로 발행 가능한 수준의 구조를 갖췄다. RTT 기반 적응형 제어를 단순 속도 개선이 아니라 Push/AIMD 이후 필요한 delay feedback loop로 설명하고, 현재 코드의 보수적인 batch 제한까지 함께 반영했다. 발행 직전 단계에서는 manifest와 공개 렌더링 검증이 추가로 필요하다.
