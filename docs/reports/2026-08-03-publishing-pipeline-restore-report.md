# 티스토리 자동 발행 파이프라인 복구·자동화 보고서

- 작성일: 2026-08-03
- 대상: `tistory-pilot` (로컬 소스) + 운영서버 `ssh ponslink` (185.222.242.222)
- 조사 대상: `ssh ponslink` / `ssh pons` 병행 진단
- 목적: 티스토리 발행 자동화 멈춤 원인 진단, 발행·생성 파이프라인 복구, 상류 자동화 신설, E2E 실발행 검증

---

## 1. 요약

1. **발행이 멈춘 근본 원인 = "상류(콘텐츠 생성) 자동화 부재"**
   - 발행 파이프라인(worker·timer·browser)은 정상이었고, 8/1 발행 13건 실측 확인
   - 8/2 이후 새 `content/generated/` 콘텐츠가 생성되지 않아 큐가 비어 타이머가 "큐 없음, 종료"
   - `generate-post → auto-queue` 체인에 자동 트리거가 **단 하나도 없음** (전부 에이전트/수동, 8/1 배치도 수동)
2. **2차 원인 — 큐 경로 불일치 (과거 표류)**
   - `auto-queue`가 fallback `${PROJECT_ROOT}/scheduled/queue`(=`app/...`)에 씀, 타이머는 `/srv/publish-workbench/scheduled/queue`(절대경로)를 읽음
   - commit `7d59ba3`로 이미 수정돼 있었고 배포본과 동일 → 코드 수정 불필요, 표류 08-01 큐 파일만 안전 보관
3. **실제 차단 요인 — 서버에 QA 통과 가능한 유료 LLM 없음**
   - `generate-post`가 `--provider xiaomi`(MiMo) 강제, 서버는 **nous 무료 모델만** 인증 → hermes 호출 실패 → 템플릿 스텁(300자) → QA(1800자) 탈락
   - `ssh pons` 호스트는 티스토리 로직 0건 (무관)
4. **문제 해결** — MiMo 키를 서버 `.env.local`에 배포 → `openai-compat` 경로 활성
5. **자동화 신설** — 매일 01:00 `tistory-generate.timer` → `generate-post --batch(15건 캡)` → `auto-queue` → 08:55 발행
6. **E2E 실발행 검증 완료** — QA 100점 글 1건 생성 → 절대 큐 등록 → Job → worker `succeeded` → **실블로그 1위 게시 확인**

---

## 2. 배포 범위

### 2.1 코드/스크립트 (로컬 소스, 서버 배포 완료)

| 경로 | 역할 |
|---|---|
| `scripts/schedule/generate-daily.sh` | 일일 생성 배치: `generate-post --batch` → `auto-queue` |
| `deploy/tistory-generate.service` | oneshot 서비스 (30분 타임아웃) |
| `deploy/tistory-generate.timer` | 매일 **01:00** (발행 08:55보다 7시간 이상 선행) |
| `scripts/schedule/deploy-generate-scheduler.sh` | 서버(sudo systemd) 배포 스크립트 |

### 2.2 서버 설정

| 항목 | 상태 |
|---|---|
| `/srv/publish-workbench/app/.env.local` | 신규 — MiMo 키 배포 (`LLM_PROVIDER=openai-compat`, `LLM_API_KEY`) |
| 표류 큐 `app/scheduled/queue/2026-08-01.json` | `_orphaned-20260801/` 하위로 보관 (중복 재발행 방지) |

### 2.3 운영 서비스 상태 (검증 시점, 모두 active)

| 유닛 | 상태 |
|---|---|
| `publish-workbench.worker` | active (1일+ 연속) |
| `publish-workbench.web` | active |
| `publish-workbench-xvfb` | active |
| `publish-queue.timer` | active (매일 08:55) |
| `tistory-generate.timer` | active (신설, 다음 08-04 01:00) |

---

## 3. 원인 분석 상세

### 3.1 호스트별 티스토리 자동화 존재 여부

| 호스트 | IP | 티스토리 로직 | 신규 배포 여부 |
|---|---|---|---|
| **ponslink** | 185.222.242.222 | ✅ `/srv/publish-workbench/app` | ✅ |
| **pons** | 43.156.100.135 | ❌ grep 0건 (n8n/사주/자동화 다른 것) | ❌ (배포 금지) |

### 3.2 발행 멈춤 원인 (2가지 겹침)

1. **상류 생성 자동화 없음 (주원인·지속적)**
   - cron: `reap-leaked-chrome`, `ponslink-health-watch` 뿐 — 생성 관련 0건
   - systemd timer: `publish-queue`뿐 — 생성 관련 0건
   - → 큐가 비어, 타이머가 매일 "오늘 큐 파일 없음, 종료" (8/1, 8/2 로그로 실증)
2. **LLM 유료 키 부재 — 자동 생성의 즉시 차단 요인**
   - `generate-post` `--provider xiaomi`(MiMo) 강제
   - 서버 hermes: nous만 인증 (xiaomi/ openai logout)
   - 무료 nous `stepfun-3.7-flash:free` 단독 호출 → 666바이트 스텁
   - → QA 게이트(1800자/8문단)가 방어해 **저품질 자동 발행 없음** 안전했음, 다만 생성 자체가 0건

---

## 4. 실행 내역

| 단계 | 작업 | 결과 |
|---|---|---|
| 1 | 큐 경로 불일치 확인 | `7d59ba3` 배포본 반영 확인, 코드 수정 불요 |
| 2 | 표류 08-01 큐 보관 | `app/scheduled/queue/_orphaned-20260801/` 이동 |
| 3 | 서버 `.env.local` MiMo 키 배포 | `API_KEY set: true`, base=https://api.xiaomimimo.com/v1 |
| 4 | MiMo 단건 생성 (move-10) | `5531자`, QA **score=100 PASS**, PIL 이미지 |
| 5 | auto-queue → 절대 큐 | `/srv/.../scheduled/queue/2026-08-03.json` 1건 등록 |
| 5b | submit-queue 드라이런 | 발행 job 계획 확인 (성공 1) |
| 6 | submit-queue → Job (실행) | `publish-post-12288ff84aa` 생성 |
| 7 | worker 발행 | job `succeeded`, 이벤트 job.created→started→lock→succeeded→released |
| 8 | 실블로그 확인 | `acstory.tistory.com` **최신 글 1위** 노출 |

---

## 5. 자동화 스케줄 (매일)

| 시각 | 트리거 | 작업 |
|---|---|---|
| **01:00** | `tistory-generate.timer` | `generate-daily.sh`: `generate-post --batch (15건 캡)` → `auto-queue` (QA·선택·믹스·캡 게이트) |
| **08:55** | `publish-queue.timer` | `publish-queue.sh` → `submit-queue.mjs` → workbench Job |
| (폴링) | `publish-workbench.worker` | Job 소비 → agbrowse → 티스토리 발행 |

발행/생성 이중 안전 게이트: QA(1800자), selectionScore, 콘텐츠 믹스 50/30/20, 일일 캡 15.

---

## 6. 커밋/배포

- 로컬 `tistory-pilot` 변경: `generate-daily.sh`, `tistory-generate.{service,timer}`, `deploy-generate-scheduler.sh` (dirty, 커밋 전)
- 서버 배포: 위 스크립트 + `.env.local` (MiMo) — 배포 완료, 타이머 3종 active
- 참고: `.gitignore`에 `.env`, `.env.local` 포함 → 키는 원격 트리킹 아님

---

## 7. 후속 제안

1. 로컬 git 커밋·푸시 (권장, 현재 uncommitted)
2. 일 캡 15건 조정 여부, 콘텐츠 주제 울타리(이사·청소·주거) 유지 점검
3. 발행 직후 Discord 알림 확인 (`DISCORD_WEBHOOK_*`)
4. 무료 hermes 모델 테스트 검토 — 현재 `mimo-v2.5` 사용 중

---

## 8. 한계

- 본문 콘텐츠의 정성 검토는 포함하지 않음 (QA 자동 점수 100 기준)
- 일일 15건 전체 자동 생성은 키 배포 후 첫 자동 배치(08-04 01:00)에서 실측 확인 필요 (본 보고서 시점 단건 생성·발행만 완주)