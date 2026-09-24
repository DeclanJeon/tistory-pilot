# post-06 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-06.txt`
- HTML: `content/ponswarp-retrospective/html/post-06.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-06/signaling-turn-data-path.svg`
  - `content/ponswarp-retrospective/assets/post-06/direct-vs-turn-fallback.svg`
  - `content/ponswarp-retrospective/assets/post-06/product-paths.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입 존재
- 5개 핵심 섹션 구조
- 코드 참조 구간 존재
- 서비스 비교 테이블 포함

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- WebRTC 선택을 영웅담으로 미화하지 않음

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `ad322f3`
  - `c647df9`
  - `4efb394`
  - `2def330`
  - `80e2be0`
  - `8f7299d`
  - `4847872`
  - `3628858`
- signaling-adapter, singlePeerConnection, webRTCService, mobileResumePolicy 코드 참조 포함

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - signaling 계층 역할
  - TURN fallback과 비용
  - direct / relay / Cloud Drop 제품 경로
  - 제품 판단 변화

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- 정보 박스, 인사이트 박스, 코드 참조 박스 포함
- 비교 테이블 포함
- 이미지 3개가 data URI로 실제 삽입됨

## 시각 자료 QA

- 결과: PASS
- signaling / TURN / data path 분리도 포함
- direct connection과 TURN fallback 비교도 포함
- direct / relay / Cloud Drop 제품 경로도 포함
- 로컬 브라우저 렌더 기준 플레이스홀더 노출 없음

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - publish CLI가 raw HTML body를 그대로 넣는지 검증 전
  - 공개 페이지 기준 최종 렌더링 확인 전
  - 시리즈 전체 작성 및 QA가 아직 완료되지 않음

## 총평

post-06은 초안과 HTML, 시각 자료 기준으로는 발행 직전 수준이다. 구조, 톤, 근거, 서비스 분석, 시각 자료는 기준을 충족한다. 다만 실제 CLI 발행 경로에서 HTML 본문이 의도대로 유지되는지 아직 검증하지 않았고, 시리즈 전체 목표도 미완료다.