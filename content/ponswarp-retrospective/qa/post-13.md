# post-13 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-13.txt`
- HTML: `content/ponswarp-retrospective/html/post-13.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-13/multi-channel-topology.svg`
  - `content/ponswarp-retrospective/assets/post-13/channel-selection-loop.svg`
  - `content/ponswarp-retrospective/assets/post-13/strategy-rollback.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 Push/AIMD 이후에도 남은 단일 DataChannel 압력 문제를 제시한다.
- 본문이 단일 채널 한계, 멀티 채널 분산, 스케줄링 부담, 네트워크 적응형 제어, 복잡도, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-10의 Push/AIMD 흐름에서 post-14의 파이프라인 병렬화 주제로 이어질 수 있게 성능 압력과 병렬화 비용을 연결한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- 멀티 채널을 성공담으로 과장하지 않고, `864c18b` 삭제 커밋을 함께 제시해 보수적으로 판단한다.
- 현재 코드의 안정성 우선 보수화와 초기 Phase 3 실험을 구분한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `6e635f3 feat: 전송 성능 최적화를 위한 Push 방식 도입 및 AIMD 혼잡 제어 알고리즘 구현`
  - `541dd0c feat: Phase 3 구현 - 멀티 채널 전략 및 네트워크 적응형 제어`
  - `26a0ccc feat: Multi-Receiver Swarm (1:N) 파일 전송 완전 구현`
  - `864c18b feat : 불필요한 MultiChannelManager를 삭제, WebRTCService를 SimplePeer 단일 채널에 최적화하여 구조를 단순화하고 안정성을 업`
  - `db175bf`, `8aff234`, `4650d02`는 순서 역전/완료 체크/파일 깨짐 맥락의 보조 근거로 언급
- 코드 앵커:
  - `PonsWarp/services/multiChannelManager.ts at 541dd0c`
  - `PonsWarp/services/networkAdaptiveController.ts at 541dd0c`
  - `PonsWarp/src/utils/constants.ts:18-43`
- 보수성:
  - 멀티 채널이 최종 성공 구조였다고 쓰지 않음
  - 현재 코드가 단일-flight batch와 4MB bounded queue로 안정성 우선화됐다고 제한적으로 설명

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
  - 운영/제품 판단 변화
- 멀티 채널이 사용자에게 직접 보이는 기능명은 아니지만 진행률 리듬, 큐 막힘, 실패 상태 표시와 연결된다는 점을 설명한다.
- 병렬화가 sender 압력을 줄이는 대신 receiver 재정렬, ACK, 저장 완료 판단을 복잡하게 만든다는 trade-off를 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- figure, caption, info box, insight box, blockquote, code reference box 포함
- 이미지 3개가 base64 data URI로 실제 삽입됨
- Tistory 본문 fragment 형태이며 전체 HTML 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `multi-channel-topology.svg`는 control 채널과 data 채널 3개가 sender/receiver 사이에 놓이는 토폴로지를 설명한다.
- `channel-selection-loop.svg`는 healthy 상태와 bufferedAmount 기반 채널 선택, 실패 분기, 통계 갱신 루프를 설명한다.
- `strategy-rollback.svg`는 Push/AIMD, Phase 3 멀티 채널, Multi-Receiver Swarm, MultiChannelManager 삭제 흐름을 시간축으로 정리한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-13은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. 멀티 채널 전략을 성능 최적화의 확정 답안으로 쓰지 않고, 단일 DataChannel 압력 완화 실험과 후속 단순화 사이의 판단 변화로 설명한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
