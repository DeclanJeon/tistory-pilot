# post-16 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-16.txt`
- HTML: `content/ponswarp-retrospective/html/post-16.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-16/receiver-watermark-loop.svg`
  - `content/ponswarp-retrospective/assets/post-16/bufferedamount-vs-storage.svg`
  - `content/ponswarp-retrospective/assets/post-16/trust-control-stack.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 backpressure를 성능 튜닝이 아니라 제품 신뢰 문제로 정의한다.
- 본문이 빠른 전송의 위험, high/low watermark, bufferedAmount의 한계, receiver write speed, UI보다 제어 루프가 먼저였다는 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-10의 Push/AIMD 이후 receiver 저장 경계와 backpressure로 자연스럽게 이어진다.

## 톤 QA

- 결과: PASS
- `~합니다` 체 유지
- 영웅 서사보다 시행착오와 보수적 판단을 설명한다.
- cosmetic UI보다 내부 제어가 먼저였다는 제품 판단을 중심에 둔다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `54cf5f4 feat: 수신 측 역압(Backpressure) 제어 구현`
  - `09161ce feat: RTT 기반 동적 혼잡 제어 알고리즘`
  - `6e635f3 feat: 전송 성능 최적화를 위한 Push 방식 도입 및 AIMD 혼잡 제어 알고리즘 구현`
  - `21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
  - `b185563 Make P2P transfers recover instead of saving partial files`
- 코드 앵커:
  - `PonsWarp/src/services/directFileWriter.ts:46-52`
  - `PonsWarp/src/services/directFileWriter.ts:96-104`
  - `PonsWarp/src/services/networkAdaptiveController.ts:38-215`
  - `PonsWarp/src/utils/constants.ts:18-29`
  - `PonsWarp/src/workers/file-receiver.worker.ts`
- 보수성 메모:
  - 새 코드 세부 구현을 invent하지 않고, 기존 evidence index와 완료된 post-07/post-08/post-10의 코드 앵커를 재사용했다.

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 제품 신뢰 문제
  - 브라우저 DataChannel queue 문제
  - receiver 저장 속도 문제
  - high/low watermark pause-resume
  - bufferedAmount와 저장 완료의 차이
  - save-complete / partial recovery와의 연결
- backpressure가 빠른 전송의 부속 기능이 아니라 완료 의미와 사용자 신뢰를 지키는 제어였음을 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 전체 HTML 문서 래퍼 없음
- Tistory 본문 fragment 형태
- figure, caption, info box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨

## 시각 자료 QA

- 결과: PASS
- `receiver-watermark-loop.svg`는 sender, DataChannel, receiver, writer와 high/low watermark pause-resume loop를 보여 준다.
- `bufferedamount-vs-storage.svg`는 sender `bufferedAmount`와 receiver 저장 완료가 다른 경계임을 보여 준다.
- `trust-control-stack.svg`는 product trust, browser transfer control, receiver storage control, recovery/completion semantics의 계층을 보여 준다.
- 세 SVG 모두 HTML에 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 라이브 발행 증거 없음

## 총평

post-16은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. Backpressure를 단순 성능 튜닝이 아니라 receiver write speed, browser buffer, high/low watermark, save-complete 의미론을 묶는 제품 신뢰 제어로 설명한다. 발행 직전 단계에서는 manifest와 실제 Tistory 렌더링 검증이 추가로 필요하다.
