# PonsWarp 회고 시리즈 시각 자료 프롬프트 모음

## 목적

이 문서는 회고 글에 들어갈 다이어그램과 설명 이미지를 반복 가능한 형태로 만들기 위한 프롬프트 모음이다. 시리즈 전체가 같은 미감과 설명 방식을 유지하도록 기본 스타일을 고정한다.

## 공통 스타일 가이드

- 용도: 한국어 기술 블로그용 설명 이미지
- 배경: 밝은 배경 우선, 필요 시 다크 보드 스타일 허용
- 색상: navy, teal, slate, white 중심
- 금지: 과한 3D 렌더, 게임 UI, 과장된 SF 스타일
- 목표: 제품 구조와 데이터 흐름을 한눈에 이해시키는 것
- 캡션 전제: 이미지 단독 완결보다 본문 설명을 보완하는 역할

## 공통 프롬프트 베이스

Create a publication-quality technical editorial diagram for a Korean engineering blog. Keep the composition clean, readable, and product-oriented. Use a restrained color palette with navy, slate, teal, and white. Avoid flashy 3D effects, marketing clichés, and decorative clutter. The diagram should help readers understand the system, not just look impressive.

## 1. 서비스 개요도

### 용도
- direct browser-to-browser transfer
- signaling / TURN / receiver-side save 분리 설명
- Cloud Drop이 붙는 시점 설명

### 프롬프트
Create a service overview diagram for a browser-based large file transfer product. Show Sender Browser on the left, Receiver Browser on the right, Signaling Server and TURN Server in the middle top, and optional Cloud Drop or object storage beneath the control plane if needed. Distinguish control path, data path, and local save path with different line styles. Use a modern SaaS engineering diagram style, bright background, precise labels, and strong readability.

## 2. 완료 상태 시퀀스 다이어그램

### 용도
- network done와 save done 차이 설명
- sender 완료와 receiver 저장 완료가 다른 사건이라는 점 설명

### 프롬프트
Create a sequence diagram for a browser P2P file transfer workflow. Lanes: Sender UI, Sender Worker, WebRTC Channel, Receiver Worker, DirectFileWriter, Receiver UI. Show the sender sending chunks, the receiver decoding and verifying, the writer flushing to storage, the receiver sending a save-complete acknowledgment, and only then the sender showing final completion. Keep it minimal, editorial, and easy to read.

## 3. 내부 아키텍처도

### 용도
- App shell, views, workers, writer, wasm, backend 관계 설명

### 프롬프트
Create an internal architecture infographic for a browser-based file transfer application. Show App Shell at the top, SenderView and ReceiverView beneath it, sender worker and receiver worker below, DirectFileWriter on the receiver side, a shared pons-core-wasm block for verification and packet logic, and signaling adapter or backend connection at the edge. Use flat boxes, subtle shadows, clean arrows, and a refined technical magazine style.

## 4. 알고리즘 제어도

### 용도
- AIMD, RTT adaptive control, backpressure, watermark 설명

### 프롬프트
Create a control-flow or algorithm diagram explaining adaptive file transfer behavior in a browser app. Include AIMD congestion control, RTT-based tuning, high and low watermark backpressure, and sender-side chunk or batch adaptation. The image should feel like a systems engineering article graphic, not a research paper figure. Use simple arrows, labeled decision points, and clean grouping.

## 5. 저장 계층 다이어그램

### 용도
- DirectFileWriter, StreamSaver, File System Access API, Blob fallback, OPFS fallback 설명

### 프롬프트
Create a storage strategy diagram for a browser file download system. Show DirectFileWriter choosing between StreamSaver, File System Access API, Blob fallback, and OPFS fallback depending on browser constraints and file size. Emphasize that storage strategy is a product reliability decision, not just an implementation detail. Use modern editorial infographic style with clear labels.

## 6. 제품 플로우 카드

### 용도
- room-first → request-first 전환
- direct transfer vs Cloud Drop
- free vs paid policy 설명

### 프롬프트
Create a product flow comparison infographic for a communication or file transfer service. Show two or three flow columns such as room-first vs request-first, direct transfer vs Cloud Drop, or free vs paid experience. The layout should be card-based, highly legible, and suitable for a Korean product retrospective article.

## 7. 실패 지점 강조용 이미지

### 용도
- file corruption
- partial save
- reconnect gap
- state drift

### 프롬프트
Create a technical failure-point diagram for a web product retrospective. Highlight where a system breaks down: for example packet corruption, partial save, reconnect gap, or state drift. Use one red or amber accent only where the failure happens, while keeping the rest of the diagram calm and readable. The tone should be analytical, not dramatic.

## 글별 우선 매핑

### post-08 전송 완료라고 뜬다고 정말 끝난 게 아니었다
- 서비스 개요도
- 완료 상태 시퀀스 다이어그램
- receiver 내부 구조도

### post-07 메모리 폭발을 처음 마주했을 때
- sender/receiver 메모리 경로 다이어그램
- 저장 계층 다이어그램
- backpressure or watermark 제어도

### post-06 WebRTC로 대용량 전송을 하겠다는 무모한 선언
- signaling / TURN / data path 분리도
- direct connection and fallback overview

### post-05 첫 커밋에서 세운 약속
- 서비스 개요도
- product promise card

## 캡션 작성 규칙

- 캡션은 이미지 설명을 반복하지 않는다.
- 캡션은 `왜 이 그림을 보는지`를 말한다.
- 길이는 1~2문장으로 유지한다.
- 예: `WebRTC 연결 그 자체보다 중요한 것은, 그 연결이 제품의 상태 모델과 어떻게 이어지는가였습니다.`
