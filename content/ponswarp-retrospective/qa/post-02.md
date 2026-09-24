# post-02 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-02.txt`
- HTML: `content/ponswarp-retrospective/html/post-02.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-02/early-product-language.svg`
  - `content/ponswarp-retrospective/assets/post-02/repetition-signals.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입 존재
- KronDelivery / filetransfer / PonsWarp 연결 구조 존재
- 제품 언어, 사용자 플로우, 시스템 책임, 디자인 판단 섹션 포함
- 읽은 기록 구간 존재

## 톤 QA

- 결과: PASS
- 금지 표현 사용 없음
- `~합니다` 체 유지
- 오래된 저장소 접근 한계를 명시하고 과장하지 않음
- 초기 프로젝트를 영웅담이나 완성된 예언처럼 쓰지 않음

## 근거 QA

- 결과: PASS
- 사용 커밋 및 기록:
  - `2021-11-30 3720959 first commit` (`KronDelivery`)
  - `2022-05-31 ec8cbb6 fist commit` (`filetransfer`)
  - `2022-05-31 d71f15b File Transfer Popup 창으로 변경`
  - `2022-06-14 3750bbf title 변경 File Send -> Send a File / File Receive -> Receive a File`
  - `ad322f3`
  - `c647df9`
  - `4efb394`
  - `638bc83`
  - `21dc9ba`
- `series-plan.md`, `evidence-index.md`, `post-03.txt`의 전사 저장소 근거와 일치

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 디자인 선택
  - 제품 판단 변화
  - 기술 스택 경계
  - 운영 책임으로의 확장

## HTML QA

- 결과: PASS
- 마크다운 fence 없음
- 정보 박스, 인사이트 박스, 블록인용, 비교 테이블, 코드 참조 박스 포함
- 이미지 2개가 data URI로 실제 삽입됨
- Tistory-ready body fragment 형식 유지

## 시각 자료 QA

- 결과: PASS
- `early-product-language.svg`는 KronDelivery / filetransfer / PonsWarp의 제품 언어 연결을 설명
- `repetition-signals.svg`는 초기 UI 신호가 제품 층, 전송/저장 책임, 운영 가능한 제품으로 확장되는 구조를 설명
- 두 SVG 모두 HTML에 data URI로 내장됨

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - publish CLI가 raw HTML body를 그대로 넣는지 검증 전
  - 공개 페이지 기준 최종 렌더링 확인 전
  - 시리즈 전체 작성 및 QA가 아직 완료되지 않음

## 총평

post-02는 초안, HTML, 시각 자료 기준으로 발행 직전 수준이다. 제한된 과거 저장소 근거를 보수적으로 다루면서도, KronDelivery와 filetransfer에 이미 보였던 파일 전송 집착, 사용자 언어, 제품 플로우 분리, PonsWarp의 현대적 구조로 이어지는 흐름을 설명한다. 실제 발행 경로 검증과 공개 렌더링 확인은 아직 남아 있다.
