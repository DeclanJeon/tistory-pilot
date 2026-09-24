# PonsWarp 회고 시리즈 이미지 프롬프트 모음

## 공통 스타일

- 기술 블로그용 설명 이미지
- 흰 배경 또는 아주 밝은 배경
- 네이비 / 청록 / 회색 포인트 컬러
- 제품 설명용 2D 다이어그램
- 과도한 3D 효과 금지
- 박스, 화살표, 레이블 위주
- 캡션과 함께 읽었을 때 의미가 살아나야 함

## 1. 서비스 개요도 템플릿

Create a clean editorial technical diagram for a browser-based product. Use a white background, crisp dark text, navy and teal accent lines, and simple rounded rectangles. The image must explain the product flow, not just decorate it. Keep labels readable and publication-ready for a Korean engineering blog.

### PonsWarp direct transfer version

Create a clean editorial technical diagram for a browser-based P2P large file transfer service. Show Sender Browser on the left, Signaling Server and TURN Server in the center, and Receiver Browser on the right. Add a separate Receiver Local Save block below the receiver. Distinguish control path, direct data path, and local save path with different line styles. Include a final save-complete acknowledgment arrow returning from Receiver back to Sender. White background, navy and teal accents, precise labels, modern Korean tech-blog infographic style.

## 2. 완료 상태 시퀀스 다이어그램 템플릿

Create a publication-quality sequence diagram with a white background, thin dark lines, blue accent highlights, and clean labels. The diagram must explain the difference between an early event and the real final event.

### PonsWarp completion semantics version

Create a publication-quality sequence diagram illustrating why transfer completion is different from save completion in a browser P2P file transfer product. Lanes: Sender UI, Sender Worker, WebRTC Channel, Receiver Worker, DirectFileWriter, Receiver UI. Steps: select file, chunk and encrypt, send packets, decode and verify, write to local target, sender thinks transfer finished, receiver save complete acknowledgment, sender marks actual completion. Minimal editorial infographic style.

## 3. 내부 아키텍처도 템플릿

Create a clean internal architecture infographic for a web product. Use flat boxes, simple arrows, restrained colors, and no glassmorphism. The goal is to show responsibility boundaries between UI, workers, storage, and backend or core modules.

### PonsWarp receiver pipeline version

Create a technical pipeline diagram for the receiver side of a browser large-file transfer engine. Show packet queue, decode, verification, reorder buffer, write buffer, DirectFileWriter, high/low watermark backpressure, and final save-complete event. White background, dark typography, blue-green accent lines, clean and publication-ready.

## 4. 기술 스택 지도 템플릿

Create a stack map infographic for a software product. Organize the stack by responsibility rather than by logo wall. White background, dark text, minimal icons, and horizontally separated layers.

### PonsWarp four-layer stack map

Create a stack map infographic for PonsWarp. Organize it into four layers: Product/UI, Browser Transfer Engine, Storage and Recovery, Core and Backend. Include React, Vite, Tailwind, Zustand, WebRTC, workers, AES-256-GCM, ZIP64, DirectFileWriter, pons-core-wasm, and Rust signaling backend. Make the diagram publication-ready for a Korean retrospective post.

## 5. 제어 알고리즘 다이어그램 템플릿

Create a technical control-flow infographic with white background, dark labels, and a minimal systems-engineering aesthetic. Show feedback loops clearly.

### Backpressure / watermark version

Create a control-loop diagram explaining high watermark pause and low watermark resume in a browser file transfer system. Show sender batch production, network transport, receiver buffer growth, writer throughput, pause signal, resume signal, and progress safety. Use blue for active flow, amber for risk points, and gray for idle states.

## 6. 제품 전환 플로우 템플릿

Create a product-evolution infographic comparing an earlier product model with a later model. Use two columns or a timeline. White background, crisp labels, subtle arrows, and a publication-quality editorial style.

### PonsLink request-first reference style

Create a product evolution diagram that contrasts room-first flow with request-first flow. Show how the entry point moves from direct room join to request, reservation, approval, and timed join window. Use a restrained SaaS editorial style with clear arrows and state labels.

## 캡션 작성 규칙

- 캡션은 설명을 반복하지 말고 논점을 한 번 더 고정해야 한다.
- 예: `PonsWarp에서 가장 큰 차이는 전송 경로가 아니라 완료 상태가 저장 계층까지 내려왔다는 점이었습니다.`
- 예: `송신자 기준 완료와 수신자 기준 완료를 분리하지 않으면 빠른 앱처럼 보여도 신뢰를 잃습니다.`
