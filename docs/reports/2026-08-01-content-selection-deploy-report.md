# 콘텐츠 선택 업그레이드 배포·QA·리뷰 보고서

- 작성일: 2026-08-01
- 대상: `tistory-pilot` + 운영서버 `ssh ponslink`
- 커밋: `020f2bf` → `3b70e87` → `7d59ba3` (origin/main 푸시 완료)
- 목적: 가이드 기반 콘텐츠 선택 파이프라인 배포, 원격 QA, 실발행 Job 투입, 결과 정리

---

## 1. 요약

1. **선택 파이프라인 구현 완료 (G001–G009)**
   - 100점 키워드 루브릭, YMYL/울타리 게이트, selectionScore, 믹스 50/30/20, 부트스트랩 캡 5
   - QA 5종 확장 + 발행 직전 재검증 + 피드백 루프
2. **Git 푸시 완료**
   - `origin/main` (`https://github.com/DeclanJeon/tistory-agbrowse.git` → 리다이렉트 `tistory-pilot`)
3. **ponslink 배포 완료**
   - `/srv/publish-workbench/app/scripts/content/*`
   - `/srv/publish-workbench/app/scripts/schedule/submit-queue.mjs`
   - `keywords.json`, `market-memory.json`, 계약 테스트, 설계 문서
4. **원격 생성 + 큐 + Job 투입**
   - move 계열 4건 생성(QA PASS) → 오늘 큐 4건 → workbench Job 4건 생성 성공
5. **현재 발행 대기 상태**
   - 1건 `running` + `qr.ready` (카카오 QR 로그인 필요)
   - 3건 `queued`
   - QR 메일 `ponslink@gmail.com` 발송 확인

---

## 2. 배포 범위

### 2.1 코드/데이터

| 경로 | 상태 |
|---|---|
| `scripts/content/keyword-score.mjs` | 신규 배포 |
| `scripts/content/select-keywords.mjs` | 신규 배포 |
| `scripts/content/auto-queue.mjs` | 교체 |
| `scripts/content/generate-post.mjs` | 교체 (Hermes timeout 5분) |
| `scripts/content/market-research.mjs` | 교체 |
| `scripts/content/qa-post.mjs` | 교체 |
| `scripts/schedule/submit-queue.mjs` | 교체 |
| `content/keywords/keywords.json` | 교체 (v2, invest disabled) |
| `content/learning/market-memory.json` | 교체 |
| `tests/content/selection-logic.test.mjs` | 배포 |
| `docs/design/content-selection-upgrade.md` | 배포 |

### 2.2 커밋

```
020f2bf Guide-based content selection so the publish queue prefers commercial fence posts.
3b70e87 Normalize queue body paths so server publish can read generated HTML.
7d59ba3 Point auto-queue at the server schedule directory and give Hermes more time.
```

### 2.3 운영 서비스 상태 (배포 직후)

| 유닛 | 상태 |
|---|---|
| `publish-queue.timer` | active (다음 트리거 2026-08-02 08:55 CEST) |
| `publish-workbench.web.service` | active |
| `publish-workbench.worker.service` | active |
| workbench HTTP `:4310` | 200 |

---

## 3. QA 결과

### 3.1 계약 테스트 (로컬/원격 동일)

```
tests/content/selection-logic.test.mjs
# tests 10
# pass 10
# fail 0
```

검증 항목:
- selectionScore 가중치 45/25/20/10
- 갭 정규화 0~26 → 0~20
- mixBucket (`cost/comparison/calculator` → 비용)
- enforceMix ±10%p / 레거시 20% / 부트스트랩 캡
- YMYL·울타리 게이트
- 상업 의도 루브릭

### 3.2 전체 테스트

- `npm test`: **72/74**
- 실패 2건은 사전 존재 (`browser-lock`, `buildTistoryBodyHtml`) — 본 변경과 무관

### 3.3 원격 드라이런

`submit-queue --date 2026-08-01 --dry-run`

| 글 | 결과 |
|---|---|
| 에어컨 청소 비용 | PASS |
| 입주청소 30평 비용 | PASS |
| 이사 추가요금 방지 | PASS |
| 포장이사 비용 | PASS |

**성공 4 / 실패 0**

### 3.4 생성 QA (서버 Hermes)

| keyword-id | 제목 | QA |
|---|---|---|
| move-01 | 2026년 포장이사비용 견적비교… | PASS 100 |
| move-02 | 입주청소가격 얼마나 할까?… | PASS 100 |
| move-04 | 2026 에어컨 청소 비용 비교… | PASS 97 |
| move-09 | 2026년 이사 추가요금 방지… | PASS 91 |
| move-08 / move-11 | (실패 후 제거) | FAIL — 템플릿/포맷 미달 |

모델: `stepfun/step-3.7-flash:free` via Hermes (Nous Portal)

---

## 4. 실발행 투입

### 4.1 큐

- 파일: `/srv/publish-workbench/scheduled/queue/2026-08-01.json`
- 선정 점수 순:
  1. move-04 score=59 (에어컨 청소 비용)
  2. move-02 score=53 (입주청소 30평 비용)
  3. move-09 score=51 (이사 추가요금 방지)
  4. move-01 score=49 (포장이사 비용)
- bodyFile: 상대경로 `content/generated/2026-08-01/*.html` (서버 호환)

### 4.2 Job 생성

`submit-queue` 실실행 결과: **성공 4 / 실패 0**

| jobId | 상태 (관측 시점) |
|---|---|
| `publish-post-1785579930033-b0bb15f9` | `running` + `qr.ready` |
| `publish-post-1785579930158-ed7e4772` | `queued` |
| `publish-post-1785579930227-0c714d84` | `queued` |
| `publish-post-1785579930306-a292501c` | `queued` |

### 4.3 차단 요인 (사람 개입 필요)

- 워커가 카카오 QR 로그인을 요구함
- QR 메일 발송 확인: `ponslink@gmail.com`
- QR 스캔 완료 전 3건은 큐 대기

---

## 5. 아키텍처 (배포 후 실제 경로)

```
[ponslink]
keywords.json
  → generate-post.mjs (Hermes)
  → qa-post.mjs (구조 QA + 시장 QA + 5종 확장)
  → auto-queue.mjs
       · YMYL/focus/enabled 게이트
       · selectionScore 정렬
       · mix 50/30/20 ±10%p
       · bootstrap cap 5
       · QUEUE_DIR = /srv/publish-workbench/scheduled/queue
  → publish-queue.timer (08:55)
       → submit-queue.mjs (qaHtmlPost 공유 + keyword 게이트)
       → workbench Job
       → worker / agbrowse
       → recordPublishFeedback(succeeded|failed)
```

### 불변식 점검

| ID | 내용 | 결과 |
|---|---|---|
| I1 | 발행 직전 QA + enabled/YMYL 재검증 | 유지 (submit-queue → qaHtmlPost 공유) |
| I2 | estimate 배점 0 | 유지 |
| I3 | 실측 CSV/SC import 경로 | 유지 |
| I4 | QA 확장 비파괴(유형 게이트) | 유지 (cost/procedure fail, 그 외 warning) |
| I5 | mix는 keywords.json contentType | 유지 |
| I6 | 부트스트랩 캡 5, invest disabled | 유지 |
| I7 | 울타리 + IT 레거시 예외 | 유지 |

---

## 6. 코드 리뷰 반영 요약

리뷰에서 올라온 차단성 이슈는 배포 전 수정했다.

| 이슈 | 조치 |
|---|---|
| `--max-posts` 미전달 | `selectPosts(..., { maxPosts })` |
| 갭 raw 0~26 직접 주입 | `normalizeGapScore` 경유 |
| 신선도 metrics 날짜 사용 | post.generatedAt 우선 |
| QA 출처/표 무조건 fail | contentType 게이트 |
| YMYL 문구 전 주제 fail | ymylRisk high/medium만 fail |
| submit-queue QA 복제 | `qaHtmlPost` 공유 |
| feedback status mismatch | `succeeded`/`failed` |
| 수동 enabled 덮어쓰기 | `enabled !== false` 보존 |
| bodyFile 절대경로 | 상대경로 + PROJECT_ROOT resolve |
| 서버 큐 경로 불일치 | `/srv/publish-workbench/scheduled/queue` 자동 감지 |
| Hermes 120s timeout | 300s |

Architect 잔여 WATCH (운영 과제, 코드 블로커 아님):
- SERP 갭 실측 데이터가 아직 비어 selectionScore 갭 항이 0
- 발행 피드백 → 배점 재보정 루프는 기록만 되고 가중치 학습 소비는 후속

---

## 7. 자동화 연속성 체크리스트

- [x] 코드 푸시
- [x] ponslink 스크립트/키워드 배포
- [x] 원격 계약 테스트 10/10
- [x] 오늘자 생성 4건 QA PASS
- [x] 오늘 큐 적재 + Job 4건 생성
- [ ] **카카오 QR 로그인 완료** ← 현재 블로커
- [ ] Job 4건 `succeeded` 확인
- [ ] Discord 성공 알림 확인
- [ ] 내일(08-02) 타이머 무인 발행용 큐 사전 적재 (권장)

---

## 8. 남은 운영 액션

1. **즉시**: `ponslink@gmail.com` QR 스캔 → 워커가 4건 순차 발행
2. **오늘 중**: Job 상태 확인
   ```bash
   ssh ponslink 'python3 - <<"PY"
   import json,glob
   for p in sorted(glob.glob("/srv/publish-workbench/data/jobs/publish-post-178557993*.json")):
     d=json.load(open(p)); print(d["jobId"], d["state"], d.get("failureCode"))
   PY'
   ```
3. **실측 데이터**: 네이버 키워드 도구 CSV →  
   `node scripts/content/select-keywords.mjs --import-csv data.csv && --refresh`
4. **내일 큐**: move-03/05/06/10 등 미발행 키워드 3~5건 생성 후 `auto-queue --date 2026-08-02`
5. **원격 저장소 URL**: origin이 옛 이름(`tistory-agbrowse`)을 가리키므로  
   `git remote set-url origin https://github.com/DeclanJeon/tistory-pilot.git` 권장

---

## 9. 결론

가이드 기반 선택 로직은 코드·테스트·서버 배포·실 Job 투입까지 완료됐다.  
자동화 파이프라인 자체는 정상 기동 중이며, **실발행 완료만 카카오 QR 로그인**에 걸려 있다.

QR 스캔 후 4건이 `succeeded`로 떨어지면 이번 배포의 end-to-end 검증은 종료다.
 
---

## 10. 최종 운영 확인 (2026-08-01 20:13 KST)

- 관리자 화면에서 `이사·청소·주거` 카테고리 생성 및 저장 완료
- 카테고리 관리 화면 새로고침 후 유지 확인
- 워커의 `0개의 파일을 업로드 중입니다.` 오판 대기 조건 수정 및 재시작
- 최종 Job 4건 `succeeded`
- 관리자 글 관리 화면에서 4개 제목·카테고리 확인
- 공개 URL 확인:
  - https://acstory.tistory.com/957 — 에어컨 청소 비용
  - https://acstory.tistory.com/956 — 포장이사 비용
  - https://acstory.tistory.com/955 — 이사 추가요금 방지
  - https://acstory.tistory.com/953 — 입주청소 30평 비용

주의: 워커 수정 전 확인 실패한 재시도로 인해 에어컨 글 `/952`, 이사 추가요금 글 `/954`가 중복 생성되었다. 자동 삭제하지 않고 운영자 확인 대상으로 남겼다.
