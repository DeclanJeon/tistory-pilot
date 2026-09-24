# post-46 QA

## 대상 파일

- Draft: `content/ponswarp-retrospective/drafts/post-46.txt`
- HTML: `content/ponswarp-retrospective/html/post-46.html`
- Assets:
  - `content/ponswarp-retrospective/assets/post-46/checkout-entitlement-flow.svg`
  - `content/ponswarp-retrospective/assets/post-46/entitlement-policy-surface.svg`
  - `content/ponswarp-retrospective/assets/post-46/provider-verification-surface.svg`

## 확인 일시

- 2026-06-23

## 구조 QA

- 결과: PASS
- 도입부에서 PayPal 버튼 자체보다 checkout 이후 상태를 entitlement로 안전하게 바꾸는 일이 더 어려웠다는 문제를 세웠다.
- 본문이 당시 제품 상태, checkout 이후 flow, entitlement 정책, PayPal/provider 변경, 시스템 구조, 실제 실패 지점, 회고 판단, 읽은 기록으로 나뉜다.
- 시리즈 기본 골격의 문제 제기, 제품 상태, 시스템 구조, 실패 지점, 설계 변경, 회고 판단, 읽은 코드/기록을 모두 포함한다.

## 톤 QA

- 결과: PASS
- 금지 표현 사용 없음: `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, `시사하는 바가 크다`를 쓰지 않았다.
- `~합니다` 체를 기본으로 유지했다.
- PayPal/Stripe를 단순 비교하거나 특정 provider의 우열로 몰지 않고, 결제 이후 권한 상태를 제품 계약으로 번역하는 문제에 집중했다.
- “결제 붙이면 끝”이라는 단순화를 피하고, 무료 정책·유료 권한·업로드/다운로드 상태·운영 관찰을 함께 다뤘다.

## 근거 QA

- 결과: PASS
- 사용 근거 문서:
  - `series-plan.md`의 Season 6 제품화와 돈의 문제, post-46 주제, 4층 구조
  - `evidence-index.md`의 제품화와 수익화 커밋 인덱스
- 사용 커밋:
  - `4847872` — async Cloud Drop / delayed downloads
  - `b6f3ea8` — first-class Cloud Drop pricing page
  - `f8f2120` — Stripe Checkout에서 Cloud Drop entitlement 발급
  - `2e4593d` — Cloud Drop billing을 PayPal로 라우팅
  - `3628858` — Cloud Drop large upload를 resumable multipart 구조로 변경
  - `a004c91` — Free plan을 first-class cloud policy로 노출
  - `212d751` — gated account and billing surfaces 비활성화
  - `d88a625` — GA4 production traffic measurement
- 보수성:
  - 현재 작업공간에 원본 PonsWarp 저장소 전체가 없으므로, 기존 회고 자료와 evidence index에 적힌 범위 안에서만 주장했다.
  - 실제 매출, 사용자 수, provider별 세부 API 동작, webhook payload 구조, DB schema 세부를 새로 invent하지 않았다.
  - PayPal 전환은 “provider 교체”가 아니라 documented commit 흐름 안에서 entitlement 검증 면적이 커진 사례로만 다뤘다.

## 서비스 분석 QA

- 결과: PASS
- 포함 항목:
  - 프로젝트 구성
  - 기술 스택
  - 사용자 플로우
  - 시스템 플로우
  - 기능 구조
  - 핵심 로직
  - 운영/배포 관점
  - 제품 판단 변화
- Cloud Drop pricing, checkout, webhook/entitlement, resumable upload, Free plan, gated billing rollback, GA4 measurement를 하나의 제품화 흐름으로 설명했다.
- 사용자 관점의 “결제 후 바로 파일을 보낼 수 있는가”와 시스템 관점의 “외부 provider 상태를 내부 권한 원장으로 번역하는가”를 분리했다.

## HTML QA

- 결과: PASS
- Tistory-ready fragment 형태이며 `html`, `head`, `body` 전체 문서 래퍼가 없다.
- 마크다운 fence 없음.
- figure, figcaption, info box, code reference box 포함.
- 이미지 3개가 base64 `data:image/svg+xml` URI로 삽입됨.

## 시각 자료 QA

- 결과: PASS
- `checkout-entitlement-flow.svg`는 사용자 → PayPal → webhook → 권한 발급 흐름을 설명한다.
- `entitlement-policy-surface.svg`는 Plan Policy, Entitlement State, Product Surface가 함께 움직이는 구조를 설명한다.
- `provider-verification-surface.svg`는 provider 변경 시 checkout API보다 server truth와 failure cases 검증 면적이 커지는 점을 설명한다.
- 세 SVG 모두 HTML에 base64 data URI로 임베드되어 있다.

## 발행 준비 상태

- 결과: REVISE
- 이유:
  - 실제 Tistory 렌더링 확인 전
  - publish manifest 미작성
  - 카테고리/태그 확정 전
  - 공개 URL 없음
  - 라이브 publish evidence 없음

## 총평

post-46은 PayPal을 결제 provider 비교로 소비하지 않고, Cloud Drop이 유료 상품이 되는 순간 checkout, webhook, entitlement, Free plan, gated surface rollback, 운영 관찰이 하나의 제품 계약으로 묶이는 과정을 설명한다. 초안과 HTML 기준의 구조·근거·시각 자료는 준비됐지만, 라이브 발행과 Tistory 렌더링 검증 전이므로 publish readiness는 REVISE다.
