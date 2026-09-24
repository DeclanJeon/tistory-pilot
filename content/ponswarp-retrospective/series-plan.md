# PonsWarp 회고 시리즈 설계

## 문서 목적

이 문서는 PonsWarp 회고 시리즈의 전체 설계 기록이다. 목표는 단순 감상문이 아니라, 제품과 서비스가 어떻게 만들어졌고 어디에서 방향이 꺾였는지 독자가 따라갈 수 있는 구조를 만드는 것이다.

이 시리즈는 다음 세 가지를 동시에 만족해야 한다.

1. 사람이 쓴 회고처럼 읽혀야 한다.
2. 제품 서비스 분석 글처럼 구조와 설계를 설명해야 한다.
3. 실제 커밋, 코드, 저장소 계보를 근거로 삼아야 한다.

## 작성 원칙

### 톤

- 한국어 `~합니다` 체를 기본으로 사용한다.
- 실제 날짜와 커밋 문구를 근거로 사용한다.
- 공개 기록으로 확인된 사실만 쓴다.
- 실패와 오판을 숨기지 않는다.
- 문제를 해결했다고 과장하지 않는다.

### 금지 표현

- `한 줄 요약`
- `먼저 핵심만 보자`
- `결론적으로`
- `시사하는 바가 크다`
- 정답을 발표하는 듯한 과도한 교훈 문장

### 모든 글의 기본 골격

각 글은 아래 7개 섹션을 기본 골격으로 삼는다.

1. 문제 제기
2. 당시 제품 상태
3. 시스템 구조
4. 실제 실패 지점
5. 설계 변경
6. 지금 돌아보는 판단
7. 읽은 코드

## 서비스 분석 규칙

각 글은 감상문처럼 끝나면 안 된다. 아래 항목 중 최소 6개 이상을 반드시 포함한다.

- 프로젝트 구성
- 디자인 패턴
- 기술 스택
- 사용자 플로우
- 시스템 플로우
- 기능 구조
- 핵심 로직
- 알고리즘
- 운영/배포 관점
- 제품 판단 변화

## 시각 자료 규칙

이미지는 장식이 아니라 이해 도구로 사용한다. 각 글은 아래 유형 중 2~4개를 사용한다.

1. 서비스 개요도
   - 브라우저 A
   - signaling 서버
   - TURN
   - 브라우저 B
   - optional Cloud Drop / R2

2. 내부 아키텍처도
   - App shell
   - SenderView / ReceiverView / CloudSenderView
   - workers
   - DirectFileWriter
   - pons-core-wasm
   - signaling backend

3. 시퀀스 다이어그램
   - 파일 선택
   - chunk 생성
   - packet encode
   - encrypt
   - data channel
   - decode
   - verify
   - write
   - ack / pause / resume

4. 알고리즘 제어도
   - AIMD
   - RTT 기반 조절
   - receiver-side watermark
   - reordering buffer
   - partial recovery

5. 제품 플로우 카드
   - direct transfer
   - Cloud Drop
   - free / paid
   - online together / offline delivery

## 반복 사용할 4층 구조

PonsWarp는 거의 모든 글에서 아래 4층 구조로 설명한다.

### 1층. Product and UI

- React 19
- Vite 7
- Tailwind 4
- Framer Motion
- Three.js / React Three Fiber
- Zustand
- `src/App.tsx`
- `src/components/SenderView.tsx`
- `src/components/ReceiverView.tsx`
- `src/components/CloudSenderView.tsx`

### 2층. Browser transfer engine

- `simple-peer` 기반 WebRTC
- sender worker
- receiver worker
- adaptive chunk/batch
- zero-copy packet pool
- AES-256-GCM
- ZIP64
- backpressure

### 3층. Storage and recovery

- `src/services/directFileWriter.ts`
- StreamSaver
- File System Access API 전략
- high/low watermark 기반 pause / resume
- partial save / recovery

### 4층. Core and backend

- `pons-core-wasm`
  - `compression`
  - `crypto`
  - `fec`
  - `packet`
  - `reordering_buffer`
  - `zero_copy_pool`
  - `zip64`
  - `file_signature`
  - `merkle_tree`
- `ponswarp-signaling-rs`
  - `admin`
  - `auth`
  - `billing`
  - `database`
  - `handlers`
  - `protocol`
  - `state`
  - `/health`
  - `/ready`
  - `/ws`

## 근거 저장소

### 로컬 저장소

- `/home/declan/Documents/Develop/Project/ponswarp/PonsWarp`
- `/home/declan/Documents/Develop/Project/ponswarp/ponswarp-signaling-rs`
- `/home/declan/Documents/Develop/Project/ponswarp/pons-core-wasm`

### 관련 저장소

- `DeclanJeon/ponswarp-desktop`
- `DeclanJeon/KronDelivery`
- `DeclanJeon/filetransfer`
- `DeclanJeon/wormhole-file-gate`

## 시간축

### PonsWarp 이전

- `KronDelivery` (2021-11-30)
- `filetransfer` (2022-05-31)
- `wormhole-file-gate` (2025-04-30)

이 구간은 파일 전송 문제에 반복적으로 돌아온 전사로 묶는다.

### PonsWarp 점화 구간

- root commit: `2025-11-20 ad322f3 feat : first commit`
- 초기 관심사:
  - WebRTC
  - 프로덕션 로깅
  - TURN / STUN
  - 대용량 전송
  - UI 정리

### 성능과 무결성 전쟁

- memory blow-up prevention
- AIMD congestion control
- sender push strategy
- save-complete handshake
- corruption fixes
- pipeline parallelism
- multi-channel strategy
- backpressure
- RTT adaptive control

### 코어 분리

- `pons-core-wasm` created on `2025-12-04`
- ZIP64
- reordering buffer
- merkle tree
- file signature
- zero-copy
- crypto

### 백엔드 현실화

- `ponswarp-signaling-rs` created on `2025-12-10`
- signaling hardening
- TURN handling
- Cloud Drop
- billing
- OAuth
- resumable multipart uploads
- readiness and cleanup

### 데스크톱 분기

- `ponswarp-desktop` created on `2025-12-17`
- native / QUIC / Tauri hope
- later stall

### 제품화 구간

- Cloud Drop pricing
- free / paid policy tension
- PayPal and entitlements
- mobile resume
- GA4 production measurement

## 50편 시리즈 지도

### Season 0. 프롤로그
1. 왜 나는 계속 파일 전송 프로젝트를 만들었나
2. `KronDelivery`와 `filetransfer`에서 이미 드러난 집착
3. `wormhole-file-gate`는 무엇을 시험한 프로젝트였나
4. PonsWarp를 시작할 때 내가 착각한 것들

### Season 1. 탄생기
5. 첫 커밋에서 세운 약속
6. WebRTC로 대용량 전송을 하겠다는 무모한 선언
7. 메모리 폭발을 처음 마주했을 때
8. 수신 저장 완료까지 기다리게 만든 이유
9. TURN 없이는 모바일이 안 붙는다는 현실
10. Push 방식과 AIMD 혼잡 제어를 붙이던 날
11. 파일 손상은 UX 문제가 아니라 신뢰 문제였다
12. 초반 UI보다 먼저 해결해야 했던 것들

### Season 2. 성능과 무결성 전쟁
13. 멀티 채널 전략은 왜 필요했나
14. 파이프라인 병렬화가 실제로 바꾼 것
15. 청크 풀링과 이중 버퍼링을 붙인 이유
16. backpressure를 구현하면서 배운 것
17. RTT 기반 적응형 제어를 넣고 나서
18. LAN 최적화는 왜 따로 필요했나
19. 파일 깨짐 문제를 끝까지 붙잡은 기록
20. 재정렬 버퍼를 둘러싼 고민
21. partial file recovery를 왜 늦게 붙였나
22. 빠른 전송보다 무결성이 먼저라는 판단

### Season 3. Rust/WASM 코어 분리
23. JS로 버티다 Rust로 내려간 순간
24. `pons-core-wasm`를 따로 만든 이유
25. ZIP64가 필요해진 진짜 이유
26. zero-copy와 메모리 경계 문제
27. Merkle tree와 file signature를 왜 넣었나
28. reordering buffer를 WASM으로 옮긴 이유
29. 암호화와 성능 최적화가 충돌하던 지점
30. 브라우저 앱인데 왜 코어가 Rust인가

### Season 4. 서버를 다시 보게 된 순간
31. 서버 없는 전송이라는 말의 절반만 맞았던 이유
32. `ponswarp-signal`에서 `ponswarp-signaling-rs`로
33. Rust signaling 서버를 따로 세운 이유
34. TURN, cleanup, deadlock, edge case
35. signaling 서버가 제품 신뢰를 좌우한 순간
36. 매치메이커일 뿐인 서버가 점점 무거워진 이유
37. readiness와 production env가 중요해진 시점
38. P2P 서비스가 운영을 피해갈 수 없다는 사실

### Season 5. 데스크톱 분기
39. 웹을 포기하고 싶었던 날
40. `ponswarp-desktop`를 만든 진짜 이유
41. QUIC와 native streaming이 더 좋아 보였던 이유
42. 그런데 왜 결국 살아남지 못했나

### Season 6. 제품화와 돈의 문제
43. Cloud Drop은 왜 붙었나
44. 무료 10GB / 24시간이라는 타협
45. 결제를 붙이는 순간 제품이 달라지는 방식
46. PayPal과 entitlement flow가 더 어려웠던 이유
47. free plan rollback에서 드러난 판단
48. analytics를 붙이고 나서야 보인 것들

### Season 7. 이후
49. PonsWarp가 PonsLink 계열로 이어진 방식
50. 지금 다시 만든다면 무엇을 남기고 무엇을 버릴까

## 우선 작성 순서

초기 배치는 아래 순서로 진행한다.

1. 8. 수신 저장 완료까지 기다리게 만든 이유
2. 7. 메모리 폭발을 처음 마주했을 때
3. 4. PonsWarp를 시작할 때 내가 착각한 것들
4. 6. WebRTC로 대용량 전송을 하겠다는 무모한 선언
5. 5. 첫 커밋에서 세운 약속
6. 1. 왜 나는 계속 파일 전송 프로젝트를 만들었나
7. 3. `wormhole-file-gate`는 무엇을 시험한 프로젝트였나
8. 2. `KronDelivery`와 `filetransfer`에서 이미 드러난 집착

## 초반 핵심 근거 커밋

- `2025-11-20 ad322f3 feat : first commit`
- `2025-11-20 638bc83 feat: 대용량 파일 다운로드 시 메모리 폭발 방지 기능 추가`
- `2025-11-21 6e635f3 feat: 전송 성능 최적화를 위한 Push 방식 도입 및 AIMD 혼잡 제어 알고리즘 구현`
- `2025-11-21 21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
- `2025-11-21 2def330 feat: TURN 서버 설정을 동적으로 가져와 모바일 WebRTC 연결 안정화`
- `2025-11-22 db175bf fix: 파일 전송 중 청크 순서 역전 및 버퍼 관리 문제 해결`
- `2025-11-27 949d921 feat(perf): Phase 2 - 파이프라인 병렬화 + 이중 버퍼링 + 청크 풀링`
- `2025-11-29 4650d02 fix: 파일 깨짐 문제 완전 해결 및 대용량 전송 성능 대폭 개선`
- `2025-12-03 54cf5f4 feat: 수신 측 역압(Backpressure) 제어 구현`
- `2025-12-03 09161ce feat: RTT 기반 동적 혼잡 제어 알고리즘`
- `2025-12-05 7b0301d feat(sender): WASM ZIP64 압축으로 마이그레이션`
- `2025-12-06 58e6b89 feat: 수신측 패킷 재정렬 버퍼를 wasm으로 마이그레이션`
- `2026-05-12 4847872 Enable async cloud drops for delayed downloads`
- `2026-05-12 b185563 Make P2P transfers recover instead of saving partial files`
- `2026-05-14 3628858 Make Cloud Drop large uploads resumable by parts`

## 후속 기록 파일

이 문서를 기준으로 아래 문서를 계속 추가한다.

- `post-08-design-spec.md`
- 이후 각 포스트별 design spec
- 이미지 생성 프롬프트 모음
- 증거 커밋 인덱스
