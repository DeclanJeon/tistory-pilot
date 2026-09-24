# PonsWarp 회고 시리즈 증거 인덱스

## 목적

이 문서는 회고 시리즈 작성 시 반복해서 참조할 핵심 커밋과 저장소를 빠르게 찾기 위한 증거 인덱스다. 글을 쓸 때마다 전체 히스토리를 다시 뒤지는 비용을 줄이기 위해 만든다.

## 저장소별 핵심 구간

### 1. PonsWarp

- root: `2025-11-20 ad322f3 feat : first commit`
- 핵심 구간 1: `2025-11-20 ~ 2025-11-29`
- 핵심 구간 2: `2025-12-03 ~ 2025-12-06`
- 핵심 구간 3: `2026-05-11 ~ 2026-05-17`
- 핵심 구간 4: `2026-06-01 ~ 2026-06-08`

### 2. pons-core-wasm

- root: `2025-12-04 15aef19 feat: 초기 pons-core-wasm 프로젝트 설정`
- 핵심 구간: `2025-12-05 ~ 2025-12-11`
- 후속 보강: `2026-05-11`, `2026-05-14`

### 3. ponswarp-signaling-rs

- root: `2025-12-10 44fb5ad feat(server): Rust 기반 시그널링 서버 초기 구현`
- 핵심 구간: `2026-05-11 ~ 2026-05-17`

### 4. ponswarp-desktop

- created: `2025-12-17`
- 관찰 포인트: `native / QUIC / Tauri` 분기
- late visible activity: `2026-02-18`

### 5. Prehistory repos

- `KronDelivery` — `2021-11-30`
- `filetransfer` — `2022-05-31`
- `wormhole-file-gate` — `2025-04-30`

## 초반 회고 글용 핵심 커밋

### 시작과 착각

- `2025-11-20 ad322f3 feat : first commit`
- `2025-11-20 c647df9 feat: WebRTC 서비스 개선 및 프로덕션 환경 로깅 추가`
- `2025-11-20 73c5e85 feat: PonsWarp SEO 및 아이콘 설정`
- `2025-11-20 4efb394 feat: 모든 호스트 허용 및 추가 stun 서버 적용`

### 메모리와 저장

- `2025-11-20 638bc83 feat: 대용량 파일 다운로드 시 메모리 폭발 방지 기능 추가`
- `2025-11-21 21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
- `2025-11-22 6fdd593 fix: 파일 전송 시스템 안정화 및 대용량 파일 지원`

### 전송 제어

- `2025-11-21 6e635f3 feat: 전송 성능 최적화를 위한 Push 방식 도입 및 AIMD 혼잡 제어 알고리즘 구현`
- `2025-11-21 2def330 feat: TURN 서버 설정을 동적으로 가져와 모바일 WebRTC 연결 안정화`
- `2025-11-24 80e2be0 feat: WebRTC 연결 안정성 및 속도 표시 개선`

### 손상과 무결성

- `2025-11-22 db175bf fix: 파일 전송 중 청크 순서 역전 및 버퍼 관리 문제 해결`
- `2025-11-22 8aff234 fix: 파일 전송 중복 완료 및 수신 완료 체크 로직 개선`
- `2025-11-29 4650d02 fix: 파일 깨짐 문제 완전 해결 및 대용량 전송 성능 대폭 개선`

### 파이프라인/멀티채널

- `2025-11-27 3b58612 feat: Phase 1 성능 최적화 구현`
- `2025-11-27 949d921 feat(perf): Phase 2 - 파이프라인 병렬화 + 이중 버퍼링 + 청크 풀링`
- `2025-11-27 541dd0c feat: Phase 3 구현 - 멀티 채널 전략 및 네트워크 적응형 제어`
- `2025-11-28 26a0ccc feat: Multi-Receiver Swarm (1:N) 파일 전송 완전 구현`

### 저장 경계와 backpressure

- `2025-12-03 54cf5f4 feat: 수신 측 역압(Backpressure) 제어 구현`
- `2025-12-03 09161ce feat: RTT 기반 동적 혼잡 제어 알고리즘`

### WASM 코어 분리

- `2025-12-04 15aef19 feat: 초기 pons-core-wasm 프로젝트 설정`
- `2025-12-05 1b6fb15 feat(zip64): 4GB 이상 파일 지원을 위한 ZIP64 스트리밍 압축 기능 추가`
- `2025-12-05 7b0301d feat(sender): WASM ZIP64 압축으로 마이그레이션`
- `2025-12-06 58e6b89 feat: 수신측 패킷 재정렬 버퍼를 wasm으로 마이그레이션`
- `2025-12-08 e589cf2 feat: 압축, Merkle Tree, 파일 서명 기능 추가`
- `2025-12-08 7fe0ca1 feat(core): 암호화 지원 Zero-Copy Pool 구현`

### Rust signaling 현실화

- `2025-12-10 44fb5ad feat(server): Rust 기반 시그널링 서버 초기 구현`
- `2025-12-11 b834716 feat: 시그널링 서버 안정성 향상 및 배포 자동화 추가`
- `2026-05-17 f1c69cb fix: prevent signaling room cleanup deadlocks`

### 제품화와 수익화

- `2026-05-11 58cec5b Raise transfer reliability to production readiness`
- `2026-05-12 4847872 Enable async cloud drops for delayed downloads`
- `2026-05-12 b6f3ea8 Add a first-class Cloud Drop pricing page`
- `2026-05-12 f8f2120 Issue Cloud Drop entitlements from Stripe Checkout`
- `2026-05-12 2e4593d Route Cloud Drop billing through PayPal`
- `2026-05-14 3628858 Make Cloud Drop large uploads resumable by parts`
- `2026-05-14 a004c91 Expose the Free plan as a first-class cloud policy`
- `2026-05-14 212d751 Disable gated account and billing surfaces`
- `2026-05-17 8f7299d fix: resume mobile receiver transfers after backgrounding`
- `2026-06-08 d88a625 Enable production traffic measurement with GA4`

## 글과 커밋의 빠른 매핑

### `전송 완료라고 뜬다고 정말 끝난 게 아니었다`

- `21dc9ba`
- `db175bf`
- `8aff234`
- `4650d02`
- `b185563`

### `메모리 폭발을 처음 마주했을 때`

- `638bc83`
- `6fdd593`
- `949d921`
- `54cf5f4`

### `PonsWarp를 시작할 때 내가 착각한 것들`

- `ad322f3`
- `c647df9`
- `4efb394`
- `2def330`

### `WebRTC로 대용량 전송을 하겠다는 무모한 선언`

- `c647df9`
- `2def330`
- `80e2be0`
- `7393c8f`

### `첫 커밋에서 세운 약속`

- `ad322f3`
- current README framing
- repo description history

## 코드 파일 앵커

### 프론트/제품

- `PonsWarp/src/App.tsx`
- `PonsWarp/src/components/SenderView.tsx`
- `PonsWarp/src/components/ReceiverView.tsx`
- `PonsWarp/src/components/CloudSenderView.tsx`

### 브라우저 엔진

- `PonsWarp/src/workers/file-sender.worker.ts`
- `PonsWarp/src/workers/file-receiver.worker.ts`
- `PonsWarp/src/services/signaling-adapter.ts`

### 저장 계층

- `PonsWarp/src/services/directFileWriter.ts`

### 코어

- `pons-core-wasm/src/lib.rs`
- `pons-core-wasm/src/reordering_buffer`
- `pons-core-wasm/src/zip64`

### 백엔드

- `ponswarp-signaling-rs/src/main.rs`

## 사용 규칙

- 글마다 최소 3개 이상의 실제 커밋을 근거로 사용한다.
- 커밋은 장식이 아니라 판단 변화의 분기점으로만 인용한다.
- 공개되지 않았거나 현재 접근 불가능한 저장소 정보는 보수적으로 다룬다.
