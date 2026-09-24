# post-05 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-05.txt`
- HTML: `content/ponswarp-retrospective/html/post-05.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-05/service-overview.svg`
  - `content/ponswarp-retrospective/assets/post-05/product-promise-card.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입 존재
- 6개 핵심 섹션 구조
- 코드 참조 구간 존재
- direct transfer / TURN / Cloud Drop 비교 테이블 포함

## 톤 QA

- 결과: PASS
- 금지 표현 검색 결과 없음
- `~합니다` 체 유지
- 첫 커밋을 영웅담으로 과장하지 않고 약속과 부채를 같이 다룸

## 근거 QA

- 결과: PASS
- 사용 근거:
  - `2025-11-20 ad322f3 feat : first commit`
  - first commit `README.md`
  - first commit `App.tsx`
  - first commit `package.json`
  - current `README.md` direct / Cloud Drop framing
  - current `src/App.tsx` SEND NOW / SEND BY LINK 분기
  - current `src/components/CloudSenderView.tsx` Cloud Drop plan policy
- first-commit design intent, current README framing, repo description history 관찰 포인트 반영

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 디자인 선택
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - direct transfer와 Cloud Drop 제품 경로
  - 운영/저장/과금 관점
  - 제품 판단 변화

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- 정보 박스, 인사이트 박스, 인용문, 코드 참조 박스 포함
- 비교 테이블 포함
- 이미지 2개가 data URI로 실제 삽입됨

## 시각 자료 QA

- 결과: PASS
- 서비스 개요도 포함
- product promise card 포함
- 밝은 editorial SVG 스타일 유지
- 로컬 파일 기준 플레이스홀더 노출 없음

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - publish CLI가 raw HTML body를 그대로 넣는지 검증 전
  - 공개 페이지 기준 최종 렌더링 확인 전
  - 시리즈 전체 작성 및 QA가 아직 완료되지 않음

## 총평

post-05는 초안과 HTML, 시각 자료 기준으로는 발행 직전 수준이다. 첫 커밋의 제품 약속, direct transfer 중심성, Cloud Drop으로 이어진 제품 분기, 초기 구조의 기술 부채를 근거와 함께 설명한다. 다만 실제 Tistory 발행 경로와 공개 페이지 렌더링은 아직 검증하지 않았다.
