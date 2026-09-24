# post-47 QA — free plan rollback에서 드러난 판단

## Structure QA
- 기본 7단계 흐름 반영: 문제 제기, 당시 제품 상태, 시스템 구조, 실제 실패 지점, 설계 변경, 지금 돌아보는 판단, 읽은 코드/근거.
- Season 6의 주제인 제품화와 돈의 문제 안에서 Cloud Drop, free / paid policy, PayPal entitlement, rollback을 하나의 판단 흐름으로 연결했다.
- 감상문으로 끝내지 않고 Product/UI, browser transfer engine, storage/recovery, backend/control plane 관점으로 구조를 분해했다.

## Tone QA
- 한국어 `~합니다` 체를 유지했다.
- 실패와 rollback을 숨기지 않고, 유료화 찬반이 아니라 제품 약속의 크기라는 관점으로 다뤘다.
- 금지 표현인 `한 줄 요약`, `먼저 핵심만 보자`, `결론적으로`, 과도한 교훈 문장을 사용하지 않았다.
- AI 요약투 대신 기존 시리즈처럼 판단의 흐름과 당시 압력을 서술했다.

## Evidence QA
- 근거 범위는 `series-plan.md`와 `evidence-index.md`의 Season 6 / 제품화와 수익화 항목에 한정했다.
- 주요 근거 커밋: `4847872`, `b6f3ea8`, `f8f2120`, `2e4593d`, `3628858`, `a004c91`, `212d751`, `8f7299d`, `d88a625`.
- 신뢰성 판단의 내부 근거로 기존 시리즈에서 반복된 `21dc9ba`, `4650d02`, `54cf5f4`를 사용했다.
- 접근 불가능하거나 문서화되지 않은 실제 매출, 사용자 수, 상세 과금 정책, 내부 운영 수치는 invent하지 않았다.

## HTML QA
- `html/post-47.html`은 `<div>` 기반 Tistory-ready fragment이며 full HTML document가 아니다.
- inline style, `<p>`, `<h2>`, `<figure>`, `<blockquote>`, evidence box 패턴을 기존 post-40 스타일에 맞췄다.
- markdown fence나 외부 이미지 링크가 없다.
- 세 SVG가 모두 base64 data URI로 embedded되어 있다.

## Visual QA
- `assets/post-47/free-plan-rollback-flow.svg`: Free plan 노출 → 판단 충돌 → rollback 흐름 설명.
- `assets/post-47/pricing-surface-vs-responsibility.svg`: 가격/무료 표면과 실제 운영 책임의 차이를 설명.
- `assets/post-47/monetization-commit-timeline.svg`: Cloud Drop, 결제, Free policy, rollback 커밋 흐름을 시각화.
- SVG는 장식용이 아니라 본문 논지를 보조하는 구조/흐름/타임라인 자료로 구성했다.

## Publish readiness
- Status: REVISE
- Reason: 초안, HTML fragment, QA, SVG asset은 완성되었지만 live Tistory publish 및 실제 게시 화면 QA가 아직 없다. 게시 전 Tistory 에디터 렌더링, 이미지 표시, 문단 간격, 모바일 표시 확인이 필요하다.
