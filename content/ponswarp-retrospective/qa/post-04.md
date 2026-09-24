# post-04 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-04.txt`
- HTML: `content/ponswarp-retrospective/html/post-04.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-04/assumption-map.svg`
  - `content/ponswarp-retrospective/assets/post-04/reality-check-timeline.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입 존재
- 착각 4개를 중심으로 한 장문 구조 존재
- 제품 구조 4층 설명 포함
- 코드 참조 구간 존재
- 서비스 분석 테이블 포함

## 톤 QA

- 결과: PASS
- 금지 표현 검색 기준 사용하지 않음
- `~합니다` 체 유지
- 실패와 착각을 과장된 교훈이 아니라 제품 판단 변화로 서술
- AI식 요약 문구 없이 회고 톤 유지

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `ad322f3`
  - `c647df9`
  - `4efb394`
  - `2def330`
  - `638bc83`
  - `21dc9ba`
- 참조 파일:
  - `PonsWarp/README.md`
  - `PonsWarp/src/App.tsx`
  - `PonsWarp/src/components/SenderView.tsx`
  - `PonsWarp/src/services/signaling-factory.ts`
  - `content/ponswarp-retrospective/evidence-index.md`

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 저장/복구 경계
  - signaling / TURN 운영 관점
  - 제품 판단 변화

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- Tistory-ready body fragment 형식
- 노란 인사이트 박스 포함
- 파란 정보 박스 포함
- 블록인용 포함
- 다크 코드 참조 박스 포함
- 비교 테이블 포함
- 이미지 2개가 data URI로 실제 삽입됨

## 시각 자료 QA

- 결과: PASS
- assumption map은 초기 착각과 현실 계층을 분리해서 보여줌
- reality-check timeline은 초기 커밋 흐름과 현실 검증 지점을 연결함
- 두 SVG 모두 밝은 editorial diagram 스타일
- HTML에서 외부 이미지 경로가 아니라 data URI로 삽입됨

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - publish CLI가 raw HTML body를 그대로 넣는지 검증 전
  - 공개 페이지 기준 최종 렌더링 확인 전
  - 시리즈 전체 작성 및 QA가 아직 완료되지 않음

## 총평

post-04는 초안, HTML, 시각 자료 기준으로 발행 전 검토 단계까지 도달했다. 글은 PonsWarp 시작 시점의 착각을 WebRTC, 대용량 전송, 저장 완료, signaling/TURN 운영 책임으로 나누어 설명하고, 현재 제품 구조와 코드 참조까지 연결한다. 실제 발행 전에는 Tistory 편집기 렌더링과 전체 시리즈 순서 검수가 남아 있다.
