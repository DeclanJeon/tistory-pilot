# post-01 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-01.txt`
- HTML: `content/ponswarp-retrospective/html/post-01.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-01/project-lineage.svg`
  - `content/ponswarp-retrospective/assets/post-01/problem-obsession-map.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입 존재
- 7개 핵심 섹션 구조
- 코드/기록 참조 구간 존재
- direct transfer / Cloud Drop 비교 테이블 포함

## 톤 QA

- 결과: PASS
- 금지 표현 검색 기준으로 `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, `시사하는 바가 크다` 사용 없음
- `~합니다` 체 유지
- 반복 프로젝트 계보를 영웅담으로 미화하지 않고, 확인 가능한 저장소/커밋 범위 안에서 보수적으로 설명함

## 근거 QA

- 결과: PASS
- 사용 커밋:
  - `ad322f3`
  - `c647df9`
  - `4efb394`
  - `638bc83`
  - `21dc9ba`
  - `4650d02`
  - `4847872`
  - `b6f3ea8`
  - `3628858`
- 사용 기록:
  - `content/ponswarp-retrospective/series-plan.md`
  - `content/ponswarp-retrospective/evidence-index.md`
  - `PonsWarp/README.md`
- KronDelivery, filetransfer, wormhole-file-gate는 현재 글에서 증거 인덱스에 있는 날짜와 계보 수준으로만 다루고, 접근 불가능한 코드 세부 구현은 단정하지 않음

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 저장/무결성 실패 지점
  - direct / Cloud Drop 제품 경로
  - 제품 판단 변화
  - 운영/측정 관점

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 금지 태그 없음
- 정보 박스, 인사이트 박스, 블록인용, 표, 코드 참조 박스 포함
- 이미지 2개가 data URI로 실제 삽입됨

## 시각 자료 QA

- 결과: PASS
- project-lineage.svg는 KronDelivery → filetransfer → wormhole-file-gate → PonsWarp 계보를 밝은 편집 다이어그램으로 표현함
- problem-obsession-map.svg는 사용자 플로우, 시스템 플로우, 실패 지점, 제품 판단이 PonsWarp 중심으로 모이는 구조를 표현함
- HTML에서 두 SVG 모두 base64 data URI로 임베드됨

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - publish CLI가 raw HTML body를 그대로 넣는지 검증 전
  - 공개 페이지 기준 최종 렌더링 확인 전
  - 시리즈 전체 작성 및 QA가 아직 완료되지 않음

## 총평

post-01은 초안과 HTML, 시각 자료 기준으로 발행 직전 수준이다. 반복된 파일 전송 프로젝트 계보를 과장하지 않고, PonsWarp의 제품 구조와 기술 선택으로 연결했다. 다만 실제 Tistory 발행 경로와 공개 페이지 렌더링은 아직 검증하지 않았으므로 발행 준비 상태는 REVISE로 둔다.
