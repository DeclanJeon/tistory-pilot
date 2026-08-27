# 콘텐츠 선택 로직 업그레이드 설계 — 수익형 블로그 가이드 반영

> 작성일: 2026-08-01
> 상태: **구현 완료 (G001~G009)** — 설계 확정 후 전체 구현, 드라이런 검증 완료
> 기준 문서: `docs/design/blog-automation-and-monetization.md` (2026-07-27) + 수익형 블로그 30일 가이드

---

## 0. 현황 진단 (코드 기반)

### 0.1 실제 실행 위치

- **ponslink** (`/srv/publish-workbench/app`, 로컬 저장소와 동일 소스):
  - `publish-queue.timer` — 매일 08:55 → `publish-queue.sh` → `submit-queue.mjs` → workbench API → agbrowse 발행
  - `ponslink-blog-automation.timer` — 5분마다, **blog.ponslink.com (WordPress) 전용** — 이 설계 범위 아님
- **pons**: 티스토리 발행 로직 없음 (cron/systemd/디렉터리/grep 검색 결과 0건). 아무 것도 배포하지 말 것.

### 0.2 현재 선택 로직 (각 파일의 실제 동작)

```
content/keywords/keywords.json   ← 수동 큐레이션 (20개)
  → scripts/content/generate-post.mjs   (LLM 글 생성, 시장 리서치 프롬프트 주입)
  → scripts/content/qa-post.mjs         (구조 QA + 시장 QA, qaScore 산출)
  → scripts/content/auto-queue.mjs      (QA 통과분 전량 → 날짜별 큐, 시간대 배분)
  → queue-upload.sh → ponslink
```

| 컴포넌트 | 현재 동작 | 한계 |
|---|---|---|
| keywords.json | `cpcTier`, `estimatedCPC`, `estimatedMonthlySearch`, `contentType`, `tags` | **전부 추정값** (설계 문서 13.1 결함 5), 선택 기준이 수동 |
| market-research.mjs | SERP 상위 제목 수집, `INTENT_RULES` 3분류(transactional/commercial/informational), 키워드 regex로 CPC 티어 추정 | 의도를 **분류**만 함, 점수화·선택에 미사용. 본문 스니펫·갭 분석 없음 |
| qa-post.mjs | 구조 QA(1,800자/8문단/4섹션/이모지 헤더/박스/AI패턴) + 시장 QA(훅/토큰/표/절차) | 연도 일관성, 출처·확인날짜, YMYL 단정 문구 검사 없음 |
| auto-queue.mjs | QA 통과분 **전량** 큐잉, 카테고리→시간대 배분, 슬롯 캡 15건/일 | 점수 순위 선택 없음, 콘텐츠 믹스 제약 없음, YMYL/주제 게이트 없음 |

### 0.3 가이드 대비 결함 (이 설계가 고치는 것)

| # | 결함 | 근거 (가이드) | 현재 코드 |
|---|------|--------------|----------|
| D1 | 상업적 의도가 선택 기준이 아님 | "검색량 × 상업적 의도 × 광고주 경쟁 × 신뢰도 × 체류", 의도 배점 25/100 | intent는 QA 힌트로만 사용, 선택은 수동 |
| D2 | YMYL 게이트 없음 | 보험·대출·세무·법률은 "초보자에게 위험, 공식 절차/서류 범위만 안전" | keywords.json이 ISA·연금·신용점수·소상공인 대출·DSR 다수 포함 (S CPC 우선) |
| D3 | 주제 집중(한 울타리) 없음 | "보험, 대출, 건강, 맛집, 연예를 한 블로그에 섞지 않는다" | IT·테크 / 투자·재테크 / 생활·정보 3개 분산 + 생활·정보 내부 산재 |
| D4 | 콘텐츠 믹스 제어 없음 | 비용·가격·비교 50% / 절차·체크리스트 30% / 문제해결 20% | auto-queue가 QA 통과분 전량 큐잉, 유형 비율 무제약 |
| D5 | SERP 갭 분석 없음 | "상위 10개 글 분석: 가격표/기준일/평수·작업범위/추가요금/실제 견적/광고문구/오래된 정보/댓글 질문" | market-research는 제목/훅/토큰만 수집 |
| D6 | 검색량·CPC 데이터 근거 없음 | "키워드 플래너로 지역/언어 설정해 실측 검증" | estimated* 필드 전부 추정 |
| D7 | 연도·출처 QA 없음 | "가격 기준일 명시", "출처와 확인 날짜", "연도만 바꿔치기 금지" | 발행 큐에 "신용점수 올리기 방법 **2025년**" 제목 존재 (2026-07-30 발행 예정) |

---

## 1. 설계 목표

가이드의 수익 공식을 선택 로직에 구현한다:

> **선택 점수 = 상업적 의도(25) + 광고 입찰가(20) + 검색량(15) + 경쟁 갭(20) + 자료 확보(10) + 지속 검색(10)**

위 점수에 **하드 게이트 3개**를 통과한 키워드만 생성·발행한다:

1. **YMYL 안전 범위**: 대출·보험·세무·법률·건강 키워드는 "공식 절차·서류·용어·문의처·수수료·경험기록" 유형만 허용. "무조건 승인/가장 좋은 추천/확실히 줄이는 방법/소송에서 이기는 방법/치료 효과 단정" 형태는 **거부**.
2. **주제 집중**: 하나의 울타리(기본값: 생활서비스 비용 — 이사·청소·렌탈·통신·주거). 울타리 밖 카테고리는 발행 금지(기존 시리즈 제외 옵션).
3. **콘텐츠 믹스**: 최근 N건(기본 10) 기준 비용형 50% / 절차·체크리스트 30% / 문제해결 20% (±10%p 허용).

---

## 2. 키워드 평가 루브릭 (100점)

`select-keywords.mjs`(신규)가 후보 키워드마다 산출한다. 배점은 가이드 4단계 표를 그대로 따른다.

| 배점 | 항목 | 산출 방법 | 데이터 출처 |
|---:|---|---|---|
| 25 | 구매·계약 의도 | 강한 상업어 히트 점수 (아래 §2.1) + 의도 분류 | 키워드 문자열 + SERP |
| 20 | 광고 입찰가 | 실측 CPC 구간 매핑 (아래 §2.2) | 네이버 키워드 도구 / 키워드 플래너 실측 |
| 15 | 검색량 | 실측 월검색량 구간 매핑 | 동일 실측 |
| 20 | 경쟁 갭 | SERP 갭 분석 (아래 §5) — 상위 글이 나쁠수록 고득점 | SERP 본문 스니펫 |
| 10 | 자료 확보 | 공식 자료 존재 여부: 정부/공공기관/사업자 약관/공개 가격표 | 수동 플래그 + 분야 규칙 |
| 10 | 지속 검색 | 계절성/시의성 감쇠. "연도" 키워드는 갱신 부담으로 감점, 비용·절차형은 만점 | 키워드 패턴 |

합산 100점. **하드 게이트 통과 + 60점 이상**만 `keywords.json` 등재 후보.

### 2.1 상업적 의도 점수 (배점 25)

가이드 "4. 돈이 되는 검색어의 형태"를 규칙화한다.

- **강한 상업어 (2점/개, 최대 16점)**: `비용 가격 견적 평균 비교 추천 업체 순위 상담 신청 가입 설치 교체 대여 렌탈 위약금 환불 보상 청구 대행 추가요금 할인`
- **보조어 (1점/개, 최대 6점)**: `준비물 절차 기간 주의사항 체크리스트 후기 장단점 셀프 직접 취소 문제 안 됨 늦어짐 분쟁`
- **정보형 단어 감점 (−4점)**: `뜻 이란 정의 종류 개념`
- **의도 타입**: 점수 ≥10 → `commercial`, 4~9 → `mixed`, <4 → `informational`. `informational`은 25점 만점 기준 5점 이하로 환산.

기존 `INTENT_RULES`(market-research.mjs) 3분류는 이 점수화로 대체하고, `detectIntent`는 호환 래퍼로 유지한다.

### 2.2 CPC/검색량 구간 매핑 (배점 20/15)

실측값을 구간으로 환산 (가이드 5단계: 지역=대한민국, 언어=한국어, 최근 12개월):

| 월검색량 | 배점 | 실측 CPC | 배점 | 티어 |
|---:|---:|---:|---:|---|
| 100,000+ | 15 | 5,000+ | 20 | S |
| 30,000+ | 12 | 3,000+ | 17 | S |
| 10,000+ | 9 | 1,500+ | 13 | A |
| 3,000+ | 6 | 800+ | 9 | B |
| 1,000+ | 3 | 300+ | 5 | C |
| <1,000 | 1 | <300 | 2 | — |

`estimatedCPC`/`estimatedMonthlySearch`는 **provenance 필드 없이는 신뢰 불가**로 취급(점수 0). 실측만 점수 반영.

---

## 3. 하드 게이트

### 3.1 YMYL 게이트 (거부 우선)

`ymylRisk` 필드(자동 추정 + 수동 확정)로 판정:

- **위험 분야**: 대출·보험·세금·법률·건강 (키워드 regex + 카테고리)
- **허용 유형** (가이드 §2 S급 후보 안전 범위): `공식 절차 정리`, `필요 서류 정리`, `공식 용어 설명`, `기관별 문의처`, `공개 수수료·처리기간`, `직접 신청 경험`, `공식 자료 풀어쓰기`
- **거부 패턴** (제목/본문 QA에서도 검사):
  - `무조건 승인`, `승인 보장`, `가장 좋은 (보험|대출) 추천`, `확실히 (줄이는|내리는) 방법`, `소송에서 이기는 방법`, `치료 효과 단정`
- **운영 정책**: 부트스트랩기(아래 §8)에는 투자·재테크 카테고리 **발행 중지**. 확장 단계에서 안전 유형만 허용.

### 3.2 주제 집중 게이트

`FOCUS_CATEGORIES` 설정(기본):

```
이사·청소·주거 (이사비용, 청소비용, 집수리, 인터넷·렌탈, 생활 체크리스트)
```

- 울타리 밖 `contentType`/카테고리는 큐 등록 차단.
- 기존 IT·개발 시리즈는 `ALLOW_LEGACY_SERIES=1`일 때만 예외 허용(기술 회고용).
- 가이드 권장: 첫 블로그는 **이사·청소·주거 비용 블로그**. 현재 acstory는 IT/금융/생활이 섞여 있으므로, 생활·정보 안의 비용형(알뜰폰·정수기·이사·에어컨)을 울타리로 삼는 **전환 경로**를 권장 (§11 결정 필요 사항).

### 3.3 콘텐츠 믹스 게이트

`contentType` v2 매핑:

| 가이드 유형 | 비중 | contentType v2 | 기존 값 매핑 |
|---|---|---:|---|---|
| 비용·가격·비교 | 50% | `cost` | comparison, calculator(비용 계산), info(비용형) |
| 절차·체크리스트 | 30% | `checklist` | guide(절차형), tutorial |
| 문제해결 | 20% | `problem` | guide(주의사항/위약금), info(문제형) |

- 잔여 라인(기술 시리즈)은 `tech`로 분리, 믹스 계산에서 제외.
- 큐 선택 시 **최근 발행 10건** 기준 비율 ±10%p 위반 후보는 다음 순위로 밀린다.

---

## 4. SERP 갭 분석 (배점 20) — market-research.mjs 확장

가이드 §5 "실제 검색결과 분석" 체크리스트를 스니펫 신호로 점수화한다. 현재는 제목만 수집하므로 **본문 스니펫(메타 description/요약 텍스트) 수집**을 추가한다.

| 갭 신호 | 감지 규칙 (스니펫 기준) | 배점 |
|---|---|---|
| 가격표 없음 | `가격/비용/요금` 키워드 주제인데 스니펫에 숫자+원 단위 0건 | +6 |
| 기준일 없음 | `202\d|년 기준|개정|시행` 미포함 | +4 |
| 작업 범위 미구분 | 주제 평수/범위 키워드인데 `평|㎡|항목|포함|별도` 미포함 | +4 |
| 추가요금 미설명 | `추가요금|별도|옵션|할증` 미포함 | +4 |
| 광고문구만 | 상위 10건 중 스니펫이 홍보성(`무료 견적|상담 신청|최저가|지금`) ≥50% | +3 |
| 오래된 정보 | 상위 10건 중 `202\d` 연도 표기 평균이 2년 이상 과거 | +3 |
| 댓글 질문 미해결 | 댓글 영역 수집은 크롤링 한계 → **스니펫 내 미답변 질문형 문장**(`왜|어떻게|가능한지|인지`) 존재 시 | +2 |

- **합산 0~26점 → 20점 만점으로 정규화** (경쟁 갭 배점).
- "상위 글이 모두 좋다" (갭 ≤5) → 키워드 후보에서 제외 권고.
- 갭 분석 결과는 `researchKeywordMarket()` 반환값에 `serpGap` 객체로 추가, `content/learning/market-memory.json`에 축적.

---

## 5. 일일 큐 선택 알고리즘 — auto-queue.mjs 교체

현재 `distributeToSlots`(카테고리→시간대, 전량 큐잉)를 **선택기 + 배치기**로 분리한다.

```
입력: content/generated/YYYY-MM-DD/*.meta.json (QA 통과분)
1. 하드 게이트: YMYL 안전 범위 / FOCUS_CATEGORIES / legacy 예외
2. 선택 점수: selectionScore = 0.45×상업의도 + 0.25×qaScore + 0.20×serpGap + 0.10×신선도
   (신선도: 생성일 기준 14일 초과 시 감점, "2025" 구제목 감점)
3. 믹스 제약: 최근 10건 비율 대비 잔여 할당 순서 결정
4. 슬롯 캡 (기존 SLOT_MAX 유지) — 점수 내림차순 배치
5. 승인 후 운영 모드: 일일 생성·발행 상한 15건
```

- `selectionScore`는 queue 포스트에 저장(디버그용), `qaScore`와 별도 필드 유지.
- 시간대 배분은 기존 `priorityOrder` 유지하되, **상위 1건을 07:00~09:00 피크에 우선 배치**(검색 피크).

---

## 6. 데이터 근거 (D6 해소)

- `keywords.json` 스키마 v2에 provenance 추가:

```json
{
  "id": "move-01",
  "keyword": "입주청소 30평 비용",
  "category": "이사·청소·주거",
  "contentType": "cost",
  "commercialIntent": 21,
  "ymylRisk": "none",
  "metrics": {
    "monthlySearch": 4400,
    "cpcKrw": 2100,
    "source": "naver-keyword-tool",
    "checkedAt": "2026-08-01"
  },
  "score": { "intent": 21, "bid": 13, "volume": 6, "gap": 14, "source": 8, "durability": 10, "total": 72 },
  "gap": { "priceTableMissing": true, "noAsOfDate": true, "extraFeesUncovered": true }
}
```

- `estimated*` 필드는 제거 또는 `metrics` 하위 실측 필드로 대체.
- 실측 수집: 네이버 검색광고 키워드 도구 / Google 키워드 플래너 **수동 1회 → CSV 저장 → `select-keywords.mjs --import-csv`** 로 자동 반영 (API 키 불필요한 경로 우선).

---

## 7. 발행 전 QA 추가 — qa-post.mjs 확장

기존 구조/시장 QA는 유지하고 추가:

| 체크 | 코드 | 판정 |
|---|---|---|
| 제목 연도 일관성 | `stale-year-title` | 제목의 연도 < 현재 연도면 **fail** (가이드: "연도만 바꿔치기" 금지의 역방향 — 낡은 연도도 금지) |
| 출처·확인 날짜 | `missing-sources` | 본문에 `출처|기준일|확인 날짜|개정` 없으면 비용형/절차형 fail, 그 외 warning |
| YMYL 단정 문구 | `ymyl-claim` | §3.1 거부 패턴 본문 발견 시 fail |
| 포함/별도 표 | `missing-cost-table` | `cost` 유형인데 `포함|별도|추가요금` 표(테이블) 없으면 fail |
| 첫 문단 직접 답 | `opener-no-answer` | 첫 120자에 수치/요금/조건 키워드 없으면 비용형 warning |

---

## 8. 발행 정책 (가이드 §9·§13 반영)

- **부트스트랩기 (애드센스 승인 전)**: 일 3~5건, 품질 우선. "하루 10개 자동 발행"은 가이드 §13의 명시적 금지 사항.
- **승인 후 운영기 (현재)**: 일일 생성·발행 최대 15건. 모든 글은 동일한 QA·YMYL·울타리·믹스 게이트를 통과해야 한다.
- **금지 인코딩** (가이드 §13 목록 → QA/프롬프트 규칙):
  - 클릭 유도 문구 금지 (`광고 클릭 부탁` 등) — 프롬프트에 명시 + QA 키워드
  - 확인 안 된 가격 단정 금지 — `estimateCpcTier`식 추정을 본문 가격으로 쓰지 못하게 프롬프트 강제
  - 제목 키워드 반복 금지 — QA에 `keyword-stuffing` 체크 추가
  - 주제 이탈 금지 — §3.2 게이트가 담당

---

## 9. 구현 계획 (파일별)

### Phase 1 — 선택 파이프라인 (핵심)

| 작업 | 파일 | 내용 |
|---|---|---|
| 스키마 v2 + 울타리 전환 | `content/keywords/keywords.json` | §6 스키마로 재작성, FOCUS 카테고리 재편 |
| 의도/점수 모듈 | `scripts/content/keyword-score.mjs` (신규) | §2 루브릭 구현, `INTENT_RULES` 대체 |
| 키워드 선정 CLI | `scripts/content/select-keywords.mjs` (신규) | CSV 실측 import → SERP 갭 → 100점 산정 → 게이트 → 순위표 |
| SERP 갭 분석 | `scripts/content/market-research.mjs` | 스니펫 수집 + §4 갭 신호 + `serpGap` 반환 |
| 큐 선택기 | `scripts/content/auto-queue.mjs` | §5 알고리즘으로 `distributeToSlots` 교체 |

### Phase 2 — QA·생성 강화

| 작업 | 파일 | 내용 |
|---|---|---|
| QA 확장 | `scripts/content/qa-post.mjs` | §7 체크 5종 추가 |
| 생성 프롬프트 | `scripts/content/generate-post.mjs` | 가이드 §7 글 구성(첫 문단 답→포함/별도 표→FAQ→출처) 유형별 템플릿 |
| 서버 측 게이트 | `scripts/schedule/submit-queue.mjs` | `qaMetaPost` 재검증이 새 QA 체크 포함하도록 (호출만 유지, 로직은 qa-post 공유) |

### Phase 3 — 피드백 루프

| 작업 | 파일 | 내용 |
|---|---|---|
| 성과 반영 | `content/learning/market-memory.json` + `recordPublishFeedback` | 발행 후 노출/클릭/상위 노출 여부 → 키워드 득점 가중치 재보정 |
| 모니터링 | Search Console 데이터 (수동 내보내기 CSV) → `select-keywords.mjs --import-search-console` | "8~20위 글 집중 개선" (가이드 §12) 자동 후보 추출 |

---

## 10. 성과 측정 (가이드 §12 기준)

| 지표 | 1개월 목표 | 3개월 목표 |
|---|---|---|
| 울타리 내 발행 글 | 18개 (가이드: 핵심 3 + 비용 8 + 체크 4 + 문제 3) | 60개 |
| 실측 키워드 데이터 | 100개 (provenance 포함) | 300개 |
| 발행 일수당 큐 품질 | QA 통과율 100%, 연도/출처 fail 0건 | 동일 |
| 콘텐츠 믹스 | 50/30/20 ±10%p | 동일 |
| 애드센스 | — | 승인 후 RPM 기반 상위 페이지 분석 |

---

## 12. 구현 현황 (2026-08-01, G001~G009 완료)

| 단계 | 파일 | 상태 | 검증 |
|---|---|---|---|
| 루브릭 모듈 | `scripts/content/keyword-score.mjs` (신규) | ✅ | 100점 배점, YMYL/울타리 게이트, 실측만 배점(I2) — CLI 단위 테스트 통과 |
| 스키마 v2 | `content/keywords/keywords.json` | ✅ | 32개 키워드 (move 12 + life 5 + tech 5 + invest 10 disabled), `enabled` 22개, 점수 필드 자동 산출 |
| SERP 갭 | `scripts/content/market-research.mjs` | ✅ | 스니펫 수집 + 갭 신호 7종 + 실패율 학습(30% 폴백), 단위 테스트 통과 |
| 선정 CLI | `scripts/content/select-keywords.mjs` (신규) | ✅ | `--import-csv`/`--import-search-console`/`--refresh`/`--mix-report`, 목킹 CSV 테스트 통과 |
| 큐 선택기 | `scripts/content/auto-queue.mjs` | ✅ | selectionScore 정렬 + YMYL/주제 게이트 + 믹스 ±10%p + 승인 후 일일 캡 15건, 07-28 실데이터 드라이런 통과 |
| QA 확장 | `scripts/content/qa-post.mjs` | ✅ | 연도/출처/YMYL/표/오프너 5종, 기존 글 재검증 (stale-year 7건 의도적 차단) |
| 프롬프트 | `scripts/content/generate-post.mjs` | ✅ | YMYL·출처·연도·비용표·오프너 지침 + cost/problem/checklist 유형 템플릿 |
| 발행 게이트 | `scripts/schedule/submit-queue.mjs` | ✅ | 발행 직전 재검증(I1) + 키워드 enabled/YMYL 중복 방어 + 피드백 기록, 07-30 큐 드라이런에서 "신용점수 2025년" 차단 확인 |
| 피드백 | `recordPublishFeedback` 연결 | ✅ | submit 성공/실패 → `content/learning/market-memory.json` |
| 발행 중복 게이트 | `scripts/lib/published-posts.mjs` (신규) + `submit-queue`/`auto-queue`/`generate-post` | ✅ | 발행 원장(`content/published.json`) + 블로그 RSS 제목 유사도 이중 판정. 08-04 정수기/ChatGPT/Docker 재발행 등 실중복 8쌍 전부 차단 실측, 11개 단위 테스트 통과, 서버 배포 완료 |

**검증 결과**: `npm test` 62/64 통과 (실패 2건은 사전 존재·본 변경 무관). 전체 드라이런(auto-queue/submit-queue/select-keywords) 통과.

**남은 운영 과제** (코드 아님):
1. 네이버 키워드 도구 실측 100개 조사 → `select-keywords.mjs --import-csv` 실행 (결정 사항 3)
2. ponslink 배포: 로컬 → `/srv/publish-workbench/app` 동기화 (queue-upload.sh 방식, git remote 없음)
3. 기존 큐의 낡은 연도 제목 글(신용점수 2025 등)은 발행 전 게이트에서 차단 — 제목 갱신 후 재생성 필요

---

## 11. 결정 사항 (2026-08-01 확정)

1. **울타리**: (a) 생활·정보 비용형 중심 전환 + **이사·청소·주거 신규 울타리 추가** (move-01~12 시드). IT 시리즈는 `allowLegacySeries: true` 예외로 유지.
2. **투자·재테크**: 부트스트랩기 **발행 중지** — invest-01~10 `enabled: false`, 발행/큐 게이트가 YMYL·주제로 이중 차단.
3. **실측 데이터**: 자동화는 `--import-csv` 경로까지 구현 완료. 100개 조사 실행(누가/언제)은 운영 결정으로 남김.
4. **SERP 스니펫**: `market-memory.json` `snippetStats`로 실패율 학습, 30% 이상 시 수집 비활성화 — 구현 완료.

1. **울타리 선택**: (a) 생활·정보의 비용형(알뜰폰/정수기/이사/에어컨) 중심으로 전환 — 기존 발행분 활용 가능, 권장 / (b) 가이드 원안대로 이사·청소·주거 신규 울타리로 재편 — 기존 금융/IT 글과 혼재 리스크.
2. **투자·재테크 처리**: 부트스트랩기 발행 중지(권장) vs 안전 유형(공식 절차/서류)만 축소 허용.
3. **실측 데이터 예산**: 네이버 키워드 도구 1회 수동 조사(100개×~5분)를 누가/언제 수행할지 — 자동화는 CSV import까지만.
4. **SERP 스니펫 수집**: 네이버 HTML 구조 변화로 파싱 노이즈 가능 — `content/learning/market-memory.json`에 실패율 기록, 30% 이상이면 스니펫 수집 비활성화 폴백.
