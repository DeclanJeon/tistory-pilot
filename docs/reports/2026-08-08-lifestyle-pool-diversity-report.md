# 생활 울타리 소주제 확장·다양성 선택 배포 보고서

- 작성일: 2026-08-08
- 대상: `tistory-pilot` + 운영서버 `ssh ponslink`
- 커밋: `582171e` (`Expand lifestyle keyword pool and diversify topic selection.`) → `origin/main` 푸시 완료
- 목적: 비슷한 청소·렌탈 주제 반복 발행을 줄이기 위해 **생활 울타리 유지 + 소주제 풀 확장 + 최근 소주제 중복 감점**을 적용하고, 서버 생성·큐까지 검증

---

## 1. 요약

1. **선택 정책 방향 확정 (옵션 1)**
   - 울타리 유지: `이사·청소·주거` + `생활·정보` (+ IT 레거시 예외)
   - 투자·재테크 / YMYL 고위험은 계속 차단
   - 소주제만 넓혀 체감 다양성 확보

2. **키워드 풀 확장**
   - enabled **37 → 72** (+35 시드)
   - `topicCluster` 필드 도입, 클러스터 **72개**
   - 주거 시공·방역·행정절차 + 자동차·통신·가전·라이프 비용형 보강

3. **선택 로직에 소주제 다양성 반영**
   - 최근/배치 동일 클러스터 반복 시 selectionScore 감쇠 (가중 25%)
   - `generate-post --batch` / `select-keywords` / `auto-queue` 동일 취지 적용
   - 계약 테스트 **14/14 통과** (로컬·원격)

4. **ponslink 배포 + 수동 생성 배치**
   - 01:00 타이머 배치는 배포 전이라 0건이었음 → 11:50 수동 `generate-daily.sh` 실행
   - 생성 meta 14건 (QA 통과 11 / 실패 3)
   - 오늘 큐 **11건** 적재 완료  
     `/srv/publish-workbench/scheduled/queue/2026-08-08.json`

5. **다음 자동 동작**
   - `publish-queue.timer` → **2026-08-09 08:55 CEST** (오늘 큐 발행)
   - `tistory-generate.timer` → **2026-08-09 01:00 CEST** (다음 생성)

---

## 2. 배경 (문제)

자동 발행 글이 매트리스·소파·냉장고 청소 / 에어컨·보일러 / 렌탈 비교로 뭉쳤다.

원인 분석:

| 요인 | 상태 (변경 전) |
|---|---|
| focusCategories | `이사·청소·주거`, `생활·정보`만 허용 |
| enabled 풀 | 37개, cost 비중 과다 |
| selectionScore | 상업 의도 45% → 비용·견적형 상시 상위 |
| generate `--batch` | 미생성 순 slice — 점수·다양성 없음 |
| 미발행 잔여 | 사실상 같은 울타리 비용형 7개 수준 |

→ 버그가 아니라 **좁은 풀 + 상업 의도 우선**의 정상 동작.  
다양화는 풀 확장 없이는 점수만 바꿔도 체감이 안 난다.

---

## 3. 변경 범위

### 3.1 코드

| 경로 | 내용 |
|---|---|
| `scripts/content/keyword-score.mjs` | `SERVICE_NOUNS` 확장, `topicClusterOf` / `topicDiversityFactor` / `applyTopicDiversity` |
| `scripts/content/auto-queue.mjs` | 최근 클러스터 감점 + `rerankWithBatchDiversity` 후 enforceMix |
| `scripts/content/select-keywords.mjs` | greedy 다양성 재순위, 게이트 차단 반영, JSON에 cluster/diversity |
| `scripts/content/generate-post.mjs` | 배치 생성 순서를 점수+다양성 greedy로 변경, focus 옵션 전달 |
| `tests/content/selection-logic.test.mjs` | 다양성 계약 4건 추가 (총 14) |

### 3.2 데이터

| 경로 | 내용 |
|---|---|
| `content/keywords/keywords.json` | v2 유지, `updatedAt=2026-08-08`, +35 키워드, 전 항목 `topicCluster` |

신규 소주제 예시:

- 주거: 커튼/블라인드/싱크대/샷시/단열/방역/곰팡이/도어락/CCTV/이불세탁/카페트/배수구/이삿짐보관/가구설치/변기/전입신고/확정일자/대형폐기물/정수기필터
- 생활: 타이어/자동차배터리·검사/중고차/인터넷·IPTV/공기청정기·식기세척기·비데·안마의자/학원/헬스장/스드메/도시가스/아이폰/휴대폰성지

### 3.3 커밋

```
582171e Expand lifestyle keyword pool and diversify topic selection.
```

원격: `origin/main` (`https://github.com/DeclanJeon/tistory-pilot.git`)

---

## 4. 선택 알고리즘 (변경 후)

하드 게이트는 기존과 동일:

1. QA 통과
2. YMYL 안전 범위
3. focusCategories / legacy 예외
4. `enabled=true`
5. 발행 중복 게이트

점수:

```
baseScore = 0.45×상업의도 + 0.25×QA + 0.20×SERP갭 + 0.10×신선도   (0~100)

diversity:
  동일 topicCluster 최근·배치 등장 0회 → 1.0
  1회 → 0.55
  2회 → 0.25
  3회+ → 0.1

selectionScore = baseScore × (0.75 + 0.25 × diversity)
```

이후 기존 믹스 게이트(비용 50 / 절차 30 / 문제해결 20 ±10%p, 레거시 20% 상한) + 일일 캡 15 + 시간대 슬롯.

---

## 5. 풀 현황 (배포 후)

| 지표 | 값 |
|---:|---|
| 전체 키워드 | 82 |
| enabled | 72 |
| disabled (투자 YMYL) | 10 |
| topicCluster | 72 |
| 이사·청소·주거 | 40 |
| 생활·정보 | 27 |
| IT·테크 (레거시) | 5 |

contentType (enabled):

| 유형 | 수 |
|---|---:|
| cost | 47 |
| problem | 8 |
| procedure | 5 |
| tech | 5 |
| checklist | 4 |
| calculator | 2 |
| info | 1 |

> 비용형 비중은 여전히 높다. 다양성은 **소주제(클러스터)** 축에서 먼저 확보했고, 유형 믹스 균형은 후속 시드 과제.

---

## 6. 검증

### 6.1 계약 테스트

로컬 / ponslink 동일:

```
tests/content/selection-logic.test.mjs
# tests 14
# pass 14
# fail 0
```

추가 검증:

- `topicClusterOf` 필드/태그/키워드 폴백
- `topicDiversityFactor` 감쇠 테이블
- `applyTopicDiversity` 25% 가중
- `rerankWithBatchDiversity` 동일 클러스터 연속 선정 방지

### 6.2 원격 풀·배치 시뮬레이션

배포 직후 (생성 전):

- enabled 72, 미발행 후보 약 36~38
- 최근 생성 클러스터가 제습기/폐가전/에어컨렌탈 등일 때  
  다음 배치 상위가 **가전렌탈·인터넷요금·휴대폰성지·정수기필터·자동차배터리·아이폰…** 으로 분산됨을 확인

### 6.3 01:00 타이머 실패 (배포 전 스냅샷)

```
===== 2026-08-08 01:00:01 =====
[dup] 7건 생략
[batch] 처리할 미발행 키워드가 없다.   ← 구 풀 기준, 확장분 미반영
생성된 글: 0개
```

원인: 키워드 확장 배포가 01:00 이후. 코드/데이터 결함 아님.

### 6.4 수동 생성 배치 (11:50~12:08 CEST)

```
bash scripts/schedule/generate-daily.sh
```

| 항목 | 결과 |
|---|---|
| 시도 상한 | 15 |
| meta 생성 | 14 |
| QA 통과 | 11 |
| QA 실패 | 3 |
| 큐 적재 | **11** |

QA 실패 (큐 제외):

| id | 키워드 |
|---|---|
| life-12 | 타이어 교체 비용 |
| life-18 | 공기청정기 렌탈 비교 |
| life-27 | 휴대폰 성지 요금제 비교 |

---

## 7. 오늘 발행 큐 (2026-08-08)

파일: `/srv/publish-workbench/scheduled/queue/2026-08-08.json`  
총 **11건** — 소주제가 청소 일변도가 아님.

| 슬롯 | 카테고리 | 키워드 | selectionScore | QA |
|---|---|---|---:|---:|
| 07:00 | 이사·청소·주거 | 정수기 필터 교체 비용 | 63 | 97 |
| 07:00 | 이사·청소·주거 | 카페트 청소 비용 | (동배치) | — |
| 09:00 | 이사·청소·주거 | CCTV 설치 비용 | — | — |
| 09:00 | 이사·청소·주거 | 샷시 교체 비용 | — | — |
| 09:00 | 이사·청소·주거 | 싱크대 교체 비용 | — | — |
| 12:00 | 생활·정보 | 자동차 배터리 교체 비용 | 63 | 97 |
| 12:00 | 생활·정보 | 아이폰 배터리 교체 비용 | 63 | 97 |
| 17:00 | 생활·정보 | 식기세척기 렌탈 비교 | 63 | 97 |
| 17:00 | 생활·정보 | 안마의자 렌탈 비교 | 63 | 97 |
| 17:00 | 생활·정보 | 인터넷 요금제 비교 | 62 | 91 |
| 20:00 | 생활·정보 | 비데 렌탈 비교 | 62 | 94 |

믹스 메모: 선정분이 비용형 중심이라 enforceMix가 일부 비용 후보를 defer.  
절차/문제해결 시드가 더 필요하면 유형 비율도 개선 가능.

---

## 8. 운영 서비스 상태 (검증 시점)

| 유닛 | 상태 | 다음 트리거 |
|---|---|---|
| `tistory-generate.timer` | active | 2026-08-09 01:00 CEST |
| `publish-queue.timer` | active | 2026-08-09 08:55 CEST |

즉시 발행이 필요하면:

```bash
ssh ponslink 'bash /srv/publish-workbench/app/scripts/schedule/publish-queue.sh'
```

---

## 9. 배포 체크리스트

- [x] 생활 울타리 유지 + 소주제 시드 35개
- [x] topicCluster + 다양성 감점 (25%) 구현
- [x] generate/select/auto-queue 경로 정렬
- [x] 계약 테스트 14/14
- [x] git 커밋·`origin/main` 푸시
- [x] ponslink 스크립트·keywords 배포
- [x] 원격 테스트 14/14
- [x] 수동 생성 배치 + 오늘 큐 11건 적재
- [ ] 오늘 큐 실발행 (타이머 08-09 08:55 또는 수동)
- [ ] QA 실패 3건 원인 분석·재생성
- [ ] 절차/문제해결 시드 추가 (유형 믹스)
- [ ] SERP 갭·CPC 실측 CSV 반영 (갭 항 0 해소)
- [ ] 로컬 워킹트리 잔여 파일 커밋 정리  
      (`published-posts.mjs`, `generate-daily.sh`, `tistory-generate.*`, `published.json` 등 — 서버엔 이미 동작 중, 블로커 아님)

---

## 10. 잔여 리스크 / 후속

1. **유형 믹스 편향**  
   enabled cost 47/72. 소주제는 넓어졌지만 “비용 글” 비율은 높다.  
   → procedure/problem/checklist 시드를 의식적으로 추가.

2. **SERP 갭·실측 메트릭**  
   다수 키워드가 `seed-pool` / 갭 raw 0 → selectionScore가 의도·QA·신선도에 치우침.

3. **QA 실패 3건**  
   타이어·공기청정기·휴대폰 성지는 본문/표/출처 게이트 재확인 후 재생성.

4. **발행 타이밍**  
   큐는 준비됐으나 publish 타이머는 익일 08:55. 당일 노출이 필요하면 수동 publish.

5. **로컬-서버 소스 드리프트**  
   일부 스케줄/중복게이트 파일이 로컬 untracked. 다음 정리 커밋에서 동기화 권장.

---

## 11. 결론

생활 울타리를 유지한 채 **후보 풀을 두 배로 늘리고**, 선택·생성 경로에 **소주제 중복 감점**을 넣어 반복 발행 패턴을 끊었다.  
서버 검증까지 끝났고, 오늘 큐 11건은 필터·시공·자동차·통신·가전으로 분산되어 있다.  
남은 운영 액션은 **큐 발행 실행**과 **유형 믹스·실측 데이터·QA 실패 재처리**다.
