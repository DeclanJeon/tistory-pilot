# Post 08 Design Spec

## Working title

전송 완료라고 뜬다고 정말 끝난 게 아니었다

## Position in series

- 시리즈 번호: 8
- 시즌: Season 1. 탄생기
- 역할: 독자가 PonsWarp를 기술 제품이 아니라 신뢰 제품으로 이해하게 만드는 첫 번째 대표 글

## Why this post comes first

이 글은 기술적으로도 강하고, 사용자 경험 측면에서도 바로 이해된다. `전송 완료`라는 문구 하나가 왜 거짓말이 될 수 있는지 보여주면, 이후의 파일 손상, partial recovery, backpressure, WASM 코어 분리까지 자연스럽게 이어진다.

## Core thesis

PonsWarp 초기에 진짜 문제는 파일을 보내는 것 자체가 아니었다. 보낸 쪽 화면에 `완료`가 떴다고 해서, 받는 쪽 파일이 안전하게 저장된 것은 아니었다. 그래서 전송 완료라는 상태를 네트워크 기준이 아니라 저장 기준으로 다시 정의해야 했다.

## Reader promise

이 글은 아래 질문에 답해야 한다.

1. 브라우저 P2P 전송에서 `완료`가 왜 믿을 수 없는 상태였는가.
2. 왜 저장이 끝날 때까지 기다리는 양방향 핸드셰이크가 필요했는가.
3. 이 판단이 이후의 backpressure, partial recovery, 무결성 설계로 어떻게 이어졌는가.

## Evidence anchors

### Primary commit anchors

- `2025-11-21 21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
- `2025-11-22 db175bf fix: 파일 전송 중 청크 순서 역전 및 버퍼 관리 문제 해결`
- `2025-11-22 8aff234 fix: 파일 전송 중복 완료 및 수신 완료 체크 로직 개선`
- `2025-11-29 4650d02 fix: 파일 깨짐 문제 완전 해결 및 대용량 전송 성능 대폭 개선`
- `2026-05-12 b185563 Make P2P transfers recover instead of saving partial files`

### Secondary context anchors

- `2025-11-20 638bc83 feat: 대용량 파일 다운로드 시 메모리 폭발 방지 기능 추가`
- `2025-12-03 54cf5f4 feat: 수신 측 역압(Backpressure) 제어 구현`
- `2025-12-06 58e6b89 feat: 수신측 패킷 재정렬 버퍼를 wasm으로 마이그레이션`

## Code files to read and cite

### Product and UI

- `/home/declan/Documents/Develop/Project/ponswarp/PonsWarp/src/components/SenderView.tsx`
- `/home/declan/Documents/Develop/Project/ponswarp/PonsWarp/src/components/ReceiverView.tsx`
- `/home/declan/Documents/Develop/Project/ponswarp/PonsWarp/src/App.tsx`

### Transfer engine

- `/home/declan/Documents/Develop/Project/ponswarp/PonsWarp/src/workers/file-sender.worker.ts`
- `/home/declan/Documents/Develop/Project/ponswarp/PonsWarp/src/workers/file-receiver.worker.ts`
- `/home/declan/Documents/Develop/Project/ponswarp/PonsWarp/src/services/signaling-adapter.ts`

### Storage and recovery

- `/home/declan/Documents/Develop/Project/ponswarp/PonsWarp/src/services/directFileWriter.ts`

### Core follow-through references

- `/home/declan/Documents/Develop/Project/ponswarp/pons-core-wasm/src/lib.rs`
- `/home/declan/Documents/Develop/Project/ponswarp/pons-core-wasm/src/reordering_buffer`

## Required analysis points

이 글은 아래 항목을 반드시 포함한다.

1. 프로젝트 구성
   - sender view
   - receiver view
   - sender worker
   - receiver worker
   - direct file writer

2. 사용자 플로우
   - sender가 전송 시작
   - receiver가 패킷 수신
   - 브라우저가 파일 저장 진행
   - sender는 전송만 끝나고 완료라고 생각하기 쉬움
   - 실제 완료는 receiver 저장 끝 + 확인 응답 이후

3. 시스템 플로우
   - chunk 생성
   - packet 전송
   - receiver decode
   - writer flush
   - 저장 완료 신호
   - sender final completion

4. 로직 포인트
   - network done와 save done를 분리해야 함
   - done 이벤트의 기준을 바꿔야 함
   - early completion은 corruption과 partial save를 가릴 수 있음

5. 알고리즘/제어 포인트
   - ack state
   - completion handshake
   - high/low watermark와 연결되는 backpressure 예고
   - 재정렬 / 무결성 문제와의 연결

6. 제품 판단 변화
   - 전송 속도보다 `사용자가 믿을 수 있는 완료 상태`가 먼저라는 판단

## Post structure

### 1. 도입

짧고 강하게 시작한다.

예상 방향:
- 보낸 사람 화면에는 완료가 떴는데, 받는 사람 파일은 아직 저장 중이거나 이미 깨져 있을 수 있었다.
- 이 상태에서 `전송 완료`라는 문구는 사실상 거짓말이었다.

### 2. 그때의 제품 상태

설명할 내용:
- PonsWarp 초반의 기본 약속은 브라우저끼리 직접 파일을 보내는 것이었다.
- 사용자 입장에서는 보내는 쪽과 받는 쪽이 하나의 전송 상태를 공유한다고 느끼기 쉽다.
- 하지만 내부적으로는 sender가 보는 완료와 receiver가 실제 저장한 완료가 달랐다.

여기서 붙일 시각 자료:
- 서비스 개요도

### 3. 왜 `전송 완료`가 거짓말이 되었는가

설명할 내용:
- sender는 데이터 채널 기준으로 `다 보냈다`고 생각할 수 있다.
- receiver는 decode, verify, browser write, flush 같은 후행 작업이 남아 있다.
- 대용량 파일에서는 이 간극이 더 커진다.
- 따라서 `전송 완료`와 `저장 완료`를 분리하지 않으면 UX가 아니라 신뢰가 깨진다.

여기서 붙일 시각 자료:
- sequence diagram: sender done vs receiver save done

### 4. 저장 완료까지 기다리게 만든 설계

핵심 설명:
- `2025-11-21 21dc9ba` 커밋이 왜 중요한지 설명한다.
- sender 최종 완료 상태를 receiver의 저장 완료 응답 이후로 미룬다.
- 이 변화는 UI 메시지 하나 바꾸는 정도가 아니라, 완료 상태의 정의를 바꾸는 일이다.

설명 포인트:
- 양방향 핸드셰이크
- final ack
- 수신자 저장 성공 여부를 completion gate로 삼는 판단

### 5. 이 판단이 왜 이후 설계를 바꿨는가

연결할 내용:
- 청크 순서 역전
- duplicate completion 방지
- 파일 깨짐 문제 해결
- partial file recovery
- backpressure
- reordering buffer

즉 저장 완료 handshake는 단발성 패치가 아니라, 이후 무결성 중심 설계의 출발점으로 묶는다.

### 6. 읽은 코드

이 섹션에서는 읽은 파일을 단순 나열하지 말고 역할을 짧게 붙인다.

예상 구성:
- `SenderView.tsx`: 사용자가 보는 전송 상태와 제어 진입점
- `ReceiverView.tsx`: 수신 상태와 저장 완료 UX가 모이는 지점
- `file-sender.worker.ts`: sender 쪽 전송 완료 판단의 기술적 배경
- `file-receiver.worker.ts`: decode, verify, progress reporting, 저장 전후 상태
- `directFileWriter.ts`: 브라우저 저장이 실제로 얼마나 비동기적이고 민감한지 보여주는 파일

### 7. 지금 돌아보는 판단

닫는 방식:
- 당시에는 빠르게 보내는 것이 더 중요해 보였지만, 실제 제품에서는 `완료`라는 단어를 함부로 쓰면 안 됐다.
- 이 글은 도덕 교훈으로 끝내지 않는다.
- 대신 이후의 corruption, backpressure, recovery 설계가 왜 거의 필연이었는지 예고하는 데서 멈춘다.

## Required visuals

### Visual 1. Service overview diagram

목적:
- 브라우저 P2P 전송에서 sender와 receiver 사이에 signaling/TURN은 있어도, 저장은 receiver 로컬에서 따로 일어난다는 점을 한눈에 보여준다.

구성:
- Sender Browser
- Signaling Server
- TURN
- Receiver Browser
- Receiver Local Save

설명 포인트:
- data path와 save path를 구분해서 그린다.

### Visual 2. Completion sequence diagram

목적:
- `sender network done`와 `receiver save done`가 같은 순간이 아니라는 걸 보여준다.

구성:
- Sender UI
- Sender Worker
- Receiver Worker
- DirectFileWriter
- Receiver UI

필수 단계:
1. file selected
2. chunks encoded
3. packets sent
4. receiver decoded
5. writer flushing
6. sender thinks transfer finished
7. receiver save complete ack
8. sender marks real completion

### Visual 3. Internal architecture card

목적:
- 이 문제가 UI 문구가 아니라 구조 문제였다는 걸 설명한다.

구성:
- App shell
- SenderView / ReceiverView
- sender worker / receiver worker
- DirectFileWriter
- optional wasm verification box

## Image generation prompt direction

### Prompt 1: service overview

A clean editorial system diagram for a browser-to-browser large file transfer service, showing Sender Browser on the left, Signaling Server and TURN in the middle, Receiver Browser on the right, and a separate Receiver Local Save box attached below the receiver. Distinguish control path, data path, and local save path with different line styles. Minimal Korean tech-blog infographic style, white background, navy and teal accents, precise labels, publication-quality layout.

### Prompt 2: completion sequence

A publication-quality sequence diagram illustrating why file transfer completion is different from file save completion in a browser P2P transfer product. Lanes: Sender UI, Sender Worker, Receiver Worker, DirectFileWriter, Receiver UI. Show packets being sent, data decoded, file writer flushing, sender prematurely thinking the transfer is done, then receiver sending final save-complete acknowledgment, then sender marking the transfer complete. White background, crisp editorial infographic style, minimal but precise.

### Prompt 3: architecture card

A clean architecture infographic for a browser-based large file transfer application. Show App Shell at the top, SenderView and ReceiverView beneath, sender worker and receiver worker under them, a DirectFileWriter block attached to the receiver side, and an optional WASM verification block beside the workers. Editorial Korean tech magazine style, glassy cards avoided, flat minimal diagram, white background, dark typography, blue-green accent lines.

## Tistory layout notes

이 글은 Tistory HTML 기준으로 구성한다.

필수 요소:
- 이모지 섹션 헤더 사용
- 코드 설명 구간에는 다크 참조 박스 사용
- 이미지 아래 캡션 사용
- 지나치게 표를 남용하지 않는다
- 블록인용은 짧고 실제 판단 문장을 강조할 때만 사용한다

## Drafting warnings

- `완료 상태 재정의`를 너무 추상적으로 쓰지 않는다.
- 사용자 피해 장면을 먼저 보여주고 기술 설명은 그 뒤에 붙인다.
- 이 글 한 편에서 corruption 문제까지 다 해결하려고 하지 않는다. corruption은 다음 글들로 넘긴다.
- `save done`의 의미를 브라우저 저장 API 현실과 연결해서 써야 한다.

## Deliverables for the next step

다음 작성 단계에서는 아래 산출물이 필요하다.

1. 본문용 세부 아웃라인
2. 근거 커밋 인용 후보 문장
3. 읽은 코드 박스에 넣을 파일별 요약
4. 이미지 3종의 실제 생성 프롬프트 최종본
5. Tistory HTML 초안
