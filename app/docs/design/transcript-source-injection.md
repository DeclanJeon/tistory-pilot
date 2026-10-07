# 설계: 트랜스크립트 소스 주입 — 부업 소재 51건 → 티스토리 발행 파이프라인

> 작성일: 2026-08-20
> 상태: **설계 완료 — 구현 전** (QA 섹션 §12 참고)
> 기준 문서: `docs/design/content-selection-upgrade.md` (2026-08-01, G001~G009 구현 완료)
> 소스 소재: `Knowledge/배움에_끝은없다-channel-md-*` + `Knowledge/similar-urls-batch-md-*` (유튜브 트랜스크립트 51건, 한국어 자동자막)

---

## 0. 요약

유튜브 부업/재택부업 트랜스크립트 51건을 **기존 생성 파이프라인의 "소스 자료"**로 주입한다.
기존 파이프라인(키워드 → LLM 생성 → QA → 큐 → 발행)의 동작은 불변으로 두고,
키워드 20개(`side-01`~`side-20`) + 소스 발췌 모듈 1개(`source-material.mjs`) +
프롬프트/QA 확장만 추가한다. 신규 서버 인프라는 없다.

- **범위**: 콘텐츠 생성 계층 (keywords.json, generate-post.mjs, qa-post.mjs, keyword-score.mjs, auto-queue.mjs)
- **비범위**: 발행 계층 (submit-queue, worker, agbrowse) — 카테고리 `category_ensure` 핸들러가 블로그에 자동 생성
- **하위 호환**: 기존 99개 키워드·생성·발행 흐름 변경 없음. `sourceMaterial` 필드는 기존 스크립트가 무시하는 선택 필드.

---

## 1. 현황 진단 (코드 기반, 2026-08-20)

### 1.1 실행 맵

| 단계 | 실행 주체 | 파일 |
|---|---|---|
| 키워드 풀 | 수동 + trends-monetize | `content/keywords/keywords.json` (99개) |
| 일일 생성 | `tistory-generate.timer` 01:00 | `scripts/schedule/generate-daily.sh` → `generate-post.mjs --batch` |
| 선택·생성 | generate-post.mjs | `pickUnpublished` → dup 게이트(RSS+원장) → `rankBatchCandidates`(게이트만) → `researchKeyword`(웹 리서치) → LLM(openai-compat/hermes) → 썸네일 → `savePost`(HTML+meta+QA) |
| 큐 등록 | auto-queue.mjs | QA 재검 → 게이트 → selectionScore → 믹스(비용50/절차30/문제20) → 시간대 슬롯 → `scheduled/queue/<date>.json` |
| 발행 | `publish-queue.timer` 08:55 | `publish-queue.sh` → `submit-queue.mjs` → workbench API(4310) → worker(`publish_post`/`category_ensure`) → agbrowse → Tistory + 원장 |
| 상주 | systemd | `publish-workbench.web/worker/xvfb.service` (worker: CDP 9230) |

### 1.2 멈춤 원인 (08-19 로그)

- 미발행 키워드 0건: 99개 중 대부분 생성 완료 (`content/generated/state.json` 누적), dup 생략 3건
- Google 트렌드 수익화 0건인 날: "오늘은 수익형 트렌드가 없다. (뉴스/연예 위주)"
- → 생성 0 → 큐 없음 → 발행 0. **evergreen 키워드 풀 보충이 근본 해법.**

### 1.3 하드 게이트 (선택·QA가 실제로 쓰는 것)

| 게이트 | 위치 | 동작 |
|---|---|---|
| 주제 집중 | `keyword-score.mjs evaluateFocusGate` | category ∈ `focusCategories`(현재: 이사·청소·주거, 생활·정보) 또는 레거시 예외. **`부업·재테크`는 현재 거부** (§12 A-1) |
| YMYL | `evaluateYmylGate` | 대출·보험·세무·건강 도메인만 검사. 부업 키워드 전부 비-YMYL (A-1 확인) |
| 중복 | `published-posts.mjs` | 원장(id) + RSS 50건(제목 유사도: substring/토큰부분집합/바이그램) |
| QA | `qa-post.mjs` | 1800자/8문단/4섹션(h1+h2)/이모지 헤더/인사이트박스(#fefce8)/정보박스(#3b82f6)/AI패턴/낡은연도/인용 |
| 믹스 | `auto-queue.mjs enforceMix` | 비용 50±10 / 절차 30±10 / 문제해결 20±10, 정보·기타(레거시) 20% 상한 |

- `scoreKeyword.pass`(총점≥60)는 CLI 표시용. **배치/큐 선택은 게이트만 사용** (rankBatchCandidates·selectPosts 코드 확인). metrics 미측정(estimate)은 bid/volume 0점이어도 선택 가능.

### 1.4 테스트·LLM 베이스라인

- `npm test`: 69/72 pass. 실패 3건은 기존 이슈 (browser-lock lease, http-server 세션·이메일로그인 — 콘텐츠 파이프라인 무관)
- LLM: `.env.local`에 `LLM_API_BASE/KEY/MODEL/PROVIDER` (openai-compat), hermes v0.20 fallback 존재

---

## 2. 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 소스 아카이브 `content/sources/부업-20260820/` (51 md + manifest.json)를 서버에 배치 | 생성은 ponslink에서 실행. 로컬 볼트 파일은 서버에 없음 |
| D2 | `focusCategories`에 `"부업·재테크"` 추가 | A-1: 현재 focus 거부. 데이터 기반이라 코드 변경 0 |
| D3 | 키워드 20개 `side-01`~`side-20` 등록, 선택 필드 `sourceMaterial` 추가 | 하위 호환: 기존 소비자(scoreKeyword 등)는 모르는 필드 무시 |
| D4 | 신규 모듈 `scripts/content/source-material.mjs` (로더/발췌/인용블록) | generate-post에 직접 로직 넣지 않고 단일 책임 |
| D5 | `researchKeyword`에 소스 블록 주입 (hybrid: 웹 리서치 유지 + 소스 병기) | 웹 리서치 실패해도 소스 기반 생성 가능. transcript-only 모드 지원 |
| D6 | `meta.json`에 `source` 필드 기록 | QA·큐·원장 추적성 |
| D7 | qa-post.mjs: 트랜스크립트 소스 글은 인용 마커 hard fail + verbatim 경고 | 자막 복붙 = 애드센스 중복 콘텐츠 리스크 (전략 문서 §6) |
| D8 | keyword-score.mjs 어휘 보정 (부업 서비스 명사·상업어 추가) | A-2: 현재 intent 0점 → selectionScore 45% 가중치에서 불리. 기존 키워드 무영향(부업 어휘 0건) |
| D9 | auto-queue.mjs `priorityOrder`에 부업·재테크 시간대 추가 | 현재 없어 전 슬롯 폴백. `['0900','1200','1700','2000']` |
| D10 | 롤백 = `enabled:false` 20건 + focusCategories 원복 | 스키마 하위 호환이라 파일 원복만으로 충분 |

---

## 3. 데이터 모델

### 3.1 keywords.json — side-XX 항목 (스키마 v2 호환, 기존 필드 + `sourceMaterial`)

```json
{
  "id": "side-01",
  "keyword": "쿠팡 위탁판매 하는법",
  "category": "부업·재테크",
  "contentType": "guide",
  "tags": ["쿠팡", "위탁판매", "부업"],
  "description": "쿠팡 위탁판매 시작 조건·수수료·정산 구조를 유튜브 사례 중심으로 정리",
  "metrics": { "monthlySearch": 0, "cpcKrw": 0, "source": "estimate", "checkedAt": "" },
  "score": { "intent": 9, "bid": 0, "volume": 0, "gap": 0, "source": 10, "durability": 10, "total": 29 },
  "gap": { "priceTableMissing": null, "noAsOfDate": null, "extraFeesUncovered": null, "rawTotal": 0 },
  "ymylRisk": "none",
  "commercialIntent": 9,
  "cpcTier": "U",
  "enabled": true,
  "ymylDomain": "",
  "topicCluster": "쿠팡 위탁판매",
  "sourceMaterial": {
    "archive": "부업-20260820",
    "mode": "hybrid",
    "excerptChars": 4000,
    "files": ["쿠팡부업후기_및_쿠팡부업사기!_인스타그램을_이용하고_쿠팡을_사칭하는_부업사기!_20260820.md"],
    "videoUrls": ["https://www.youtube.com/watch?v=eVT1YtLq2nk"]
  }
}
```

### 3.2 manifest.json (`content/sources/부업-20260820/manifest.json`)

```json
{
  "archive": "부업-20260820",
  "createdAt": "2026-08-20",
  "totalFiles": 51,
  "files": [
    {
      "file": "쿠팡부업후기_및_쿠팡부업사기!_…_20260820.md",
      "videoUrl": "https://www.youtube.com/watch?v=eVT1YtLq2nk",
      "channel": "부업사기X파일",
      "title": "쿠팡부업후기 및 쿠팡부업사기! …",
      "chars": 0
    }
  ]
}
```

### 3.3 meta.json — `source` 필드 (savePost 확장)

```json
"source": {
  "type": "transcript",
  "archive": "부업-20260820",
  "videoUrls": ["https://www.youtube.com/watch?v=eVT1YtLq2nk"],
  "citations": ["부업사기X파일 | 쿠팡부업후기 … | https://www.youtube.com/watch?v=eVT1YtLq2nk"]
}
```

---

## 4. `scripts/content/source-material.mjs` 설계

```
상수: ARCHIVE_ROOT = PROJECT_ROOT/content/sources
API:
  loadManifest(archive) → { files: [{file, videoUrl, channel, title, chars}] } | null
  loadExcerpts(keywordEntry) → [{ videoUrl, channel, title, text }]
  buildSourceBlock(keywordEntry) → string (프롬프트 삽입용) | ''
  sourceCitations(keywordEntry) → string[] (meta.json용)
```

발췌 규칙 (md 형식: `# 제목` / `> **채널:**` … `---` / `## [MM:SS]` 섹션):
1. 파일 앞부분 헤더(제목·채널·길이·URL·추출일, `---`까지) 제거
2. `## [MM:SS]` 기준 섹션 분리, 섹션별 plain text 추출
3. 주제 필터: 키워드 tags 토큰 중 하나라도 섹션 텍스트에 포함되면 후보 (부재 시 전체)
4. 후보 섹션을 텍스트 길이 내림차순으로 선택, `excerptChars`(기본 4000자)까지 누적
5. 각 섹션 앞에 인용 마커: `[출처: {channel} | {title} | {videoUrl}]`
6. 파일 1개당 최대 2섹션 (소스 다양성 유지)

실패 정책 (생성 실패 금지):
- manifest/파일 누락 → 해당 파일 스킵 + `console.warn`, 빈 블록이어도 계속
- 전부 실패 → `buildSourceBlock` 빈 문자열, `mode=transcript-only`면 웹 리서치 생략 후 생성 진행
- 로드 중 예외 → catch 후 빈 블록 (파이프라인 중단 없음)

---

## 5. `generate-post.mjs` 변경점 (최소 침습)

| 위치 | 변경 |
|---|---|
| import | `import { buildSourceBlock, sourceCitations } from './source-material.mjs'` |
| `researchKeyword` | `if (keywordEntry.sourceMaterial) { context.sourceBlock = await buildSourceBlock(keywordEntry); context.sourceCitations = sourceCitations(keywordEntry); if (keywordEntry.sourceMaterial.mode === 'transcript-only') market = null; }` |
| `buildUserPrompt` | `sourceBlock`이 있으면 참고자료 블록 삽입 + 사용 규칙 3줄 (아래) |
| `savePost` | `meta.source = { type:'transcript', archive, videoUrls, citations }` (keywordEntry.sourceMaterial 있을 때만) |

프롬프트 참고자료 블록 (buildUserPrompt에 삽입):

```
[참고 자료 (유튜브 트랜스크립트 발췌)]
{sourceBlock}
[/참고 자료]

사용 규칙:
1. 참고 자료는 소재로만 사용한다. 문장을 그대로 복사하지 말고 요약·재구성한다.
2. 수치·수익 주장은 (출처: 채널명 | 영상제목) 을 근처에 명시한다.
3. 수익·실적 수치는 "사례"로만 표현하고, "보장"·"무조건" 표현을 쓰지 않는다.
4. 클릭베이트 제목(억 단위 수익)을 그대로 쓰지 말고 정보형 제목으로 재구성한다.
```

---

## 6. `qa-post.mjs` 확장

`qaHtmlPost`/`qaMetaPost`에 옵션 `sourceType`(meta.source.type) 전달:

| 코드 | 조건 | 판정 |
|---|---|---|
| `missing-source-citation` | sourceType==='transcript' && 인용 마커(`출처|참고|유튜브|영상|채널`) 0개 | **fail** (기존 `missing-citation`과 별개, 소스 글은 무조건 적용) |
| `possible-verbatim` | sourceType==='transcript' && 소스 파일과 최장 공통 문자열 비율 > 0.6 | **warning** (v1) |

- 구현: `qa-post.mjs`에 소스 파일 로드는 `source-material.mjs`의 원문과 대조 (LCS는 2만자 이하 소스 기준 O(n·m) 허용, 초과 시 샘플링)
- 기존 QA 임계값(1800자/8문단/4섹션/박스)은 그대로 — 소스 평균 1만자라 충분 (전략 문서 §3)

---

## 7. `keyword-score.mjs` 어휘 보정 (D8)

| 리스트 | 추가어 |
|---|---|
| SERVICE_NOUNS (+6점/개, 최대 12) | `부업`, `투잡`, `위탁판매`, `리셀`, `쇼핑쇼츠`, `애드포스트`, `전자책`, `크몽`, `당근마켓` |
| STRONG_COMMERCIAL_WORDS (+2점/개, 최대 14) | `수익`, `정산`, `판매` |
| AUX_WORDS (+1점/개, 최대 5) | `하는법`, `사기`, `현실`, `경험`, `수익화` |

- 영향 검증: 기존 99개 키워드에 부업 어휘 0건 (keywords.json 스캔) → 기존 점수 무변화
- 보정 후 시뮬레이션: 20개 중 commercial 5·mixed 13·informational 2 (§12 A-2) — 게이트는 전부 통과, selectionScore 상향

---

## 8. `auto-queue.mjs` 시간대 (D9)

```js
const priorityOrder = {
  …기존 5개 유지…,
  '부업·재테크': ['0900', '1200', '1700', '2000']
};
```

- contentType → 믹스 버킷 매핑 (기존 `mixBucket` 그대로): cost/comparison/calculator→비용, guide/checklist→절차, problem→문제해결
- 20개 키워드 구성: cost 8 / comparison 2 / guide 7 / checklist 1 / problem 2 → 비용 10(50%)·절차 8(40%)·문제 2(10%) — 목표 ±10%p 내

---

## 9. 키워드 20개 최종안 (side-01~side-20)

| id | keyword | contentType | topicCluster | 소스 파일 (대표) |
|---|---|---|---|---|
| side-01 | 쿠팡 위탁판매 하는법 | guide | 쿠팡 위탁판매 | 쿠팡부업후기…, 쿠팡 손부업 사기 |
| side-02 | 쿠팡 위탁판매 수수료 | cost | 쿠팡 위탁판매 | 쿠팡부업후기… |
| side-03 | 당근마켓 리셀 수익 구조 | cost | 당근 리셀 | 당근에서 찾은 집에서 하는 부업, 95% 싸게파는 전국비밀창고 |
| side-04 | 당근마켓 부업 종류 | comparison | 당근 리셀 | 🥕당근에서 찾은…, 41살에 부업으로… |
| side-05 | 네이버 블로그 애드포스트 수익 | cost | 네이버 블로그 | AI 글쓰기로 퇴근 후… |
| side-06 | 네이버 블로그 부업 현실 | guide | 네이버 블로그 | AI 글쓰기로 퇴근 후… |
| side-07 | AI 글쓰기 부업 | guide | AI 부업 | AI 글쓰기로 퇴근 후…, 소파에서 휴대폰 하나로 GPT… |
| side-08 | ChatGPT 수익화 방법 | guide | AI 부업 | 소파에서 휴대폰 하나로 GPT… |
| side-09 | 유튜브 쇼츠 부업 수익 구조 | cost | 쇼츠 부업 | 26년 8월 최신버전 쇼핑쇼츠… |
| side-10 | 쇼핑쇼츠 부업 하는법 | guide | 쇼츠 부업 | 쇼핑 쇼츠 부업 추천…, 26년 8월 최신버전… |
| side-11 | 외국인 대상 한국어 가르치기 부업 | guide | 외국인 강의 | 이건 저희 부모님도 가능해요… (2개 채널) |
| side-12 | 한국어 과외 플랫폼 비교 | comparison | 외국인 강의 | 이건 저희 부모님도 가능해요… |
| side-13 | 전자책 판매 부업 | guide | 전자책 | (크몽 언급 소스) |
| side-14 | 크몽 전자책 판매 수수료 | cost | 전자책 | (크몽 언급 소스) |
| side-15 | 부업 사기 구분법 | problem | 사기 경고 | 쿠팡부업후기 및 쿠팡부업사기! |
| side-16 | 재택부업 사기 유형 | problem | 사기 경고 | "쿠팡 손부업 전부 사기였습니다"… |
| side-17 | 직장인 투잡 추천 | comparison | 투잡 추천 | 퇴근 후 그냥 쉬면 손해입니다… |
| side-18 | 주부 재택 부업 추천 | comparison | 투잡 추천 | 부업으로 남편 퇴사시켰어요… |
| side-19 | 하루 1시간 부업 | guide | 하루 1시간 | 하루 30분이면 가능한…, 퇴근하고 하루 10분… |
| side-20 | 중고거래 리셀 수익 | cost | 당근 리셀 | 95% 싸게파는 전국비밀창고… |

---

## 10. 테스트 계획

신규 `tests/content/source-material.test.mjs`:
1. manifest 누락 → 빈 블록 + warn (예외 아님)
2. 파일 누락 → 해당 파일 스킵, 나머지 로드
3. 헤더(`# `, `> **`, `---`) 제거 + `## [MM:SS]` 섹션 분리
4. `excerptChars` 제한 + 파일당 섹션 2개 캡
5. 인용 마커 형식 정확성 (`[출처: {channel} | {title} | {url}]`)
6. 주제 필터: tags 토큰 포함 섹션 우선

신규 `tests/content/side-keyword-gate.test.mjs`:
7. focusCategories에 부업·재테크 추가 시 gates 통과 (rankBatchCandidates 경로)
8. 부업 어휘 보정 후 intent>0 (side-01 ~ side-20 전부)
9. 회귀: 기존 99개 키워드 scoreKeyword 결과 무변화 (어휘 추가 전후 동일)

기존 `tests/**/*.test.mjs` 72건 전체 통과 유지 (기존 실패 3건은 콘텐츠 무관 — §1.4).

---

## 11. 배포 / 롤백

### 배포 (구현 후)
```bash
# 1) 로컬 볼트 → 서버 소스 아카이브
rsync -az "Knowledge/배움에_끝은없다-channel-md-20260820-012736/" ponslink:/srv/publish-workbench/app/content/sources/부업-20260820/
rsync -az "Knowledge/similar-urls-batch-md-20260820-012926/" ponslink:/srv/publish-workbench/app/content/sources/부업-20260820/
# 2) manifest.json 생성 (source-material.mjs가 --build-manifest 지원 또는 수동)
# 3) 코드 배포 (source-material.mjs + generate-post/qa-post/keyword-score/auto-queue 변경)
rsync -az --exclude node_modules --exclude content --exclude scheduled scripts/ src/ ponslink:/srv/publish-workbench/app/
# 4) keywords.json 병합 (side-01~20 + focusCategories) — 수동 리뷰 후 배포
# 5) 검증: npm test → 드라이런(generate-daily.sh --dry-run) → side-01 단일 생성(--keyword-id side-01) → QA 확인 → auto-queue --dry-run
```

### 롤백
- `enabled:false` 20건 + `focusCategories`에서 부업·재테크 제거 (keywords.json 원복)
- 코드 롤백: git revert (scripts/src 변경만)
- 소스 아카이브 삭제는 선택 (무해)

---

## 12. 설계 QA (프로브 증거)

| # | 검증 항목 | 방법 | 결과 |
|---|---|---|---|
| A-1 | focus 게이트가 부업·재테크 거부 | `keyword-score.mjs` CLI 프로브 (서버) | 거부 확인 → **D2 필수** (`울타리 밖 카테고리: 부업·재테크 (FOCUS: 이사·청소·주거, 생활·정보)`) |
| A-1' | focusCategories 추가 시 통과 | 로컬 사본 keywords.json에 반영 → `scoreKeyword(kw, {focusCategories+부업·재테크})` | **통과** (`울타리 카테고리: 부업·재테크`), YMYL none |
| A-2 | 부업 키워드 intent 0점 | CLI 프로브 (서버) | 0점(informational) → **D8 필수**. 보정 시뮬레이션: commercial 5 / mixed 13 / informational 2 (ChatGPT는 "수익화"로 재명명) |
| A-3 | 중복 충돌 없음 | `buildDuplicateGate` + RSS 50건 + 원장 113건, 20개 키워드 대조 | **dup 0/20** |
| A-4 | LLM 생성 가능 | .env.local 키 존재 + hermes v0.20 | openai-compat + fallback 사용 가능 |
| A-5 | 테스트 베이스라인 | `npm test` | 69/72 (실패 3건: browser-lock·http-server — 콘텐츠 무관, 기존 이슈) |
| A-6 | 소스 분량 충분 | 51파일 52만 자, 평균 1.0만 자 | QA 1800자 임계 대비 여유 |
| A-7 | 믹스 버킷 적합 | side 20개 contentType → `mixBucket` | 비용 50%·절차 40%·문제 10% — 목표 ±10%p 내 |
| A-8 | CLI 스코어 도구 한계 | keyword-score CLI는 focusCategories 미전달 | 파이프라인(rankBatchCandidates/selectPosts)은 전달 — CLI만 문서화 |

**설계 결론**: 20개 키워드 + focusCategories 1줄 + source-material.mjs 1모듈 + generate/QA/score/auto-queue 확장으로 주입 가능. 신규 서버 인프라·발행 계층 변경 없음. 구현 시 A-1' 경로로 배치 드라이런부터 검증.
