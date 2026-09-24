# post-21 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-21.txt`
- HTML: `content/ponswarp-retrospective/html/post-21.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-21/preconditions-ladder.svg`
  - `content/ponswarp-retrospective/assets/post-21/resume-handshake.svg`
  - `content/ponswarp-retrospective/assets/post-21/user-expectation-shift.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 partial file recovery가 늦은 이유를 “기능 누락”이 아니라 선행 안정성 조건 문제로 제시한다.
- 본문이 초반 reliability 작업, 저장/순서/재연결 전제, 실제 resume 흐름, 사용자 기대 변화, 회고 판단으로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-19/20의 파일 손상·재정렬 흐름에서 post-22의 무결성 우선 판단으로 이어질 수 있게 recovery를 신뢰 계약으로 연결한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 기준으로 `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, `시사하는 바가 크다`를 사용하지 않음.
- `~합니다` 체 유지.
- partial recovery를 만능 기능으로 과장하지 않고, callback/transfer type/MAX_RESUME_ATTEMPTS 조건을 함께 제시한다.
- live publish evidence가 없으므로 발행 준비 상태는 보수적으로 둔다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
  - `db175bf`, `8aff234`, `4650d02`는 파일 손상/byteOffset/async write 완료 의미의 선행 reliability 맥락
  - `b185563 Make P2P transfers recover instead of saving partial files`
  - `8f7299d fix: resume mobile receiver transfers after backgrounding`은 사용자 기대 변화와 mobile resume의 보조 근거
- 코드 앵커:
  - `PonsWarp/src/services/directFileWriter.ts:128-133` — flow control과 resume request callback 보유
  - `PonsWarp/src/services/directFileWriter.ts:1297-1342` — finalize 단계에서 buffered missing data와 incomplete size를 resume request로 전환
  - `PonsWarp/src/services/directFileWriter.ts:1529-1566` — `onResumeRequest`, `requestResumeFromCurrentOffset`, `MAX_RESUME_ATTEMPTS`, 복구 가능 조건
  - `PonsWarp/src/services/webRTCService.ts:316-335` — writer resume request를 `RESUME_REQUEST` control message로 송신
  - `PonsWarp/src/services/webRTCService.ts:548-558` — receiver reconnect 조건에 active transfer, room, writer, manifest/file count를 요구
  - `PonsWarp/src/services/swarmManager.ts:680-721` — sender가 resume offset을 검증하고 `runPartitionedTransfer(offset)` 실행
  - `PonsWarp/src/workers/file-sender.worker.ts:319-368` — worker가 offset 기준으로 reader, buffer, sequence, zero-copy byte count를 재설정
  - `PonsWarp/src/utils/mobileResumePolicy.ts:46-73` — resume offset을 file index/file offset/global offset/sequence/partition boundary로 매핑
- 보수성:
  - 모든 partial file이 복구 가능하다고 쓰지 않음
  - ZIP receiver mode 또는 size가 엄격한 단일 파일 조건 등 현재 코드의 제한을 명시함
  - publish evidence, manifest, 실제 Tistory 렌더링은 확인하지 않았다고 분리함

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 핵심 로직
  - 알고리즘/제어 흐름
  - 운영/제품 판단 변화
- partial recovery를 저장 계층 단독 기능이 아니라 DirectFileWriter, WebRTCService, SwarmManager, sender worker, mobile resume policy가 맞물린 제품 계약으로 설명한다.
- resume/recovery가 들어오면 사용자가 “처음부터 다시”가 아니라 “끊긴 곳부터 이어 달라”고 기대하게 된다는 UX 변화를 설명한다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음.
- 금지 태그 없음.
- figure, caption, insight box, blockquote, code reference box 포함.
- 이미지 3개가 base64 data URI로 실제 삽입됨.
- Tistory 본문 fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼를 포함하지 않는다.

## 시각 자료 QA

- 결과: PASS
- `preconditions-ladder.svg`는 저장 계층, 순서/무결성, 완료 의미, 복구 계약의 선행 조건을 계단 구조로 설명한다.
- `resume-handshake.svg`는 DirectFileWriter, WebRTCService, SwarmManager/worker 사이의 RESUME_REQUEST와 offset 재시작 흐름을 설명한다.
- `user-expectation-shift.svg`는 recovery 전후 사용자 기대가 “처음부터 다시”에서 “끊긴 곳부터 이어 달라”로 바뀌는 제품 변화를 설명한다.
- 세 SVG 모두 HTML에는 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 카테고리 확정 필요
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 공개 URL 없음

## 총평

post-21은 초안과 HTML 기준으로 발행 가능한 구조를 갖췄다. partial recovery를 단순 편의 기능으로 쓰지 않고, 저장 완료 의미, reordering, backpressure, mobile resume이 먼저 필요했던 후속 신뢰 계약으로 설명한다. 발행 직전 단계에서는 manifest, 카테고리, 실제 Tistory 렌더링 검증이 추가로 필요하다.
