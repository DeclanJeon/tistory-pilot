# post-12 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-12.txt`
- HTML: `content/ponswarp-retrospective/html/post-12.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-12/priority-stack.svg`
  - `content/ponswarp-retrospective/assets/post-12/truthful-flow.svg`
  - `content/ponswarp-retrospective/assets/post-12/failure-matrix.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 초반 UI polish보다 아래층의 신뢰 계약이 먼저였다는 문제를 제시한다.
- 본문이 상태 진실성, 연결 조건, 저장 완료, backpressure, 메모리 압력, 모바일 resume, UI 역할 재정의로 나뉜다.
- `읽은 코드` 구간이 존재한다.
- post-10의 Push/AIMD와 post-11의 무결성 주제 뒤에서, Season 1을 정리하며 Season 2 성능/무결성 전쟁으로 넘어가는 브리지 역할을 한다.

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- 한국어 `~합니다` 체 유지
- UI를 폄하하지 않고, UI가 시스템 상태를 번역하는 층이라는 보수적인 판단으로 정리한다.
- 과장된 성공담보다 완료 오판, 모바일 생명주기, 메모리 압력 같은 실패 조건을 중심으로 설명한다.

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `638bc83 feat: 대용량 파일 다운로드 시 메모리 폭발 방지 기능 추가`
  - `21dc9ba feat: 파일 전송 완료 후 수신자 저장까지 대기하는 양방향 핸드셰이크 기능 구현`
  - `6e635f3 feat: 전송 성능 최적화를 위한 Push 방식 도입 및 AIMD 혼잡 제어 알고리즘 구현`
  - `2def330 feat: TURN 서버 설정을 동적으로 가져와 모바일 WebRTC 연결 안정화`
  - `54cf5f4 feat: 수신 측 역압(Backpressure) 제어 구현`
  - `8aff234 fix: 파일 전송 중복 완료 및 수신 완료 체크 로직 개선`
  - `8f7299d fix: resume mobile receiver transfers after backgrounding`
- 코드/문서 앵커:
  - `content/ponswarp-retrospective/evidence-index.md:40-105`
  - `PonsWarp/src/services/webRTCService.ts`
  - `PonsWarp/src/utils/mobileResumePolicy.ts`
  - `PonsWarp/src/services/directFileWriter.ts`
  - `PonsWarp/src/workers/file-receiver.worker.ts`

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 핵심 로직
  - 운영/모바일 생명주기 관점
  - 제품 판단 변화
- UI polish를 단독 주제가 아니라 연결 truthfulness, completion semantics, backpressure, memory pressure, mobile resume 위에 놓인 제품 표현 계층으로 설명한다.
- major claim은 evidence-index의 커밋 및 기존 post-06~post-10의 코드 앵커 범위 안에서만 다룬다.

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- Tistory-ready body fragment이며 `html`, `head`, `body` 전체 문서 래퍼 없음
- emoji section headers, blue info box, yellow insight box, blockquote, dark code reference box 포함
- 이미지 3개가 `data:image/svg+xml;base64,` data URI로 실제 삽입됨

## 시각 자료 QA

- 결과: PASS
- `priority-stack.svg`는 UI polish 아래에 연결 진실성, 완료 의미, 흐름 제어, 메모리 생존이 놓인 우선순위를 설명한다.
- `truthful-flow.svg`는 sender UI에서 DirectFileWriter와 save-complete ACK까지 이어지는 완료/제어 흐름을 설명한다.
- `failure-matrix.svg`는 연결, 완료, 메모리, backpressure, 모바일 resume 실패 조건과 근거 커밋을 한 장에 정리한다.
- 세 SVG 모두 HTML에 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - publish manifest 미작성
  - 실제 Tistory 렌더링 확인 전
  - 라이브 발행/미리보기 증거 없음

## 총평

post-12는 초반 UI보다 먼저 해결해야 했던 기반 문제를 Season 1 정리 글로 구성한다. 연결 truthfulness, save completion, backpressure, memory pressure, mobile resume을 기존 evidence-index와 완료된 회고 글의 근거 안에서 보수적으로 연결했다. 발행 직전에는 manifest 반영과 Tistory 렌더링 확인이 필요하다.
