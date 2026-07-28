# Tistory Pilot 자동화 / QA / Discord 알림 구축 보고서

- 작성일: 2026-07-28
- 대상: `tistory-pilot` + 운영서버 `ssh ponslink`
- 목적: 스케줄 발행, 콘텐츠 생성, 발행 전 QA, Discord 알림, 서버 자동 배포 파이프라인 정리

---

## 1. 요약

이번 작업으로 아래를 구축/검증했다.

1. **운영서버 스케줄 발행**
   - `publish-queue.timer` 매일 08:55 (CEST) 실행
   - 큐 JSON → workbench Job → agbrowse 발행
2. **콘텐츠 자동 생성**
   - Xiaomi MiMo v2.5 (`api.xiaomimimo.com`) 기반 글 생성
   - Hermes/OpenAI-compatible provider 지원
3. **발행 전 QA 게이트**
   - tistory-blog 스킬 규칙 검사
   - 웹 경쟁 글 리서치 기반 시장 QA
   - QA 실패 글은 큐/발행 차단
4. **Discord 웹훅 알림**
   - 발행 성공/실패 시 Discord 전송
   - 서버 worker에 배포 완료
5. **사전 큐 적재**
   - 2026-07-29: 6건
   - 2026-07-30: 6건
   - 서버 `/srv/publish-workbench/scheduled/queue/` 업로드 완료

---

## 2. 아키텍처

```
[로컬 생성]
keywords.json
  → generate-post.mjs (MiMo + tistory-blog skill + market research)
  → qa-post.mjs (구조 QA + 시장 QA)
  → auto-queue.mjs (QA 통과분만 날짜별 큐)
  → queue-upload.sh (scp → ponslink)

[운영서버]
publish-queue.timer (매일 08:55)
  → publish-queue.sh
  → submit-queue.mjs (구조 QA 재검증 + Job 생성)
  → publish-workbench.worker
  → agbrowse-automation (Tistory 발행)
  → Discord webhook (성공/실패 알림)
```

### 역할 분리
- **로컬**: 글 생성, 시장 리서치, QA, 큐 준비
- **ponslink 서버**: 실제 브라우저 발행, 타이머, Discord 알림

---

## 3. 주요 구현 목록

### 3.1 스케줄러
- `scripts/schedule/queue-add.mjs`
- `scripts/schedule/submit-queue.mjs`
- `scripts/schedule/queue-upload.sh`
- `scripts/schedule/publish-queue.sh`
- `scripts/schedule/deploy-scheduler.sh`
- `deploy/publish-queue.service`
- `deploy/publish-queue.timer`

### 3.2 콘텐츠 생성
- `scripts/content/generate-post.mjs`
  - provider: `auto | hermes | openai | openai-compat | template`
  - 기본 모델: `mimo-v2.5`
  - API: `https://api.xiaomimimo.com/v1`
  - 생성 시 tistory-blog `SKILL.md` 로드
  - 시장 리서치 프롬프트 주입
  - 저장 직전 QA, 실패 시 `qa_failed`
- `content/keywords/keywords.json` (20개 키워드)

### 3.3 QA
- `scripts/content/qa-post.mjs`
  - 구조 검사: 분량, 문단/섹션, 인사이트/정보 박스, AI 패턴, 마크다운 금지, 제목 품질
  - 시장 검사: 의도/CPC/제목 훅/비교표/신청절차/도입 키워드
- `scripts/content/market-research.mjs`
  - 네이버/구글 상위 글 수집
  - 제목 훅, 의도, CPC 티어, 공통 토큰 분석
  - `content/learning/market-memory.json`에 학습 축적

### 3.4 Discord 알림
- `scripts/lib/discord-notify.mjs`
- worker 연동
  - 성공: `src/worker/handlers.mjs`
  - 실패: `src/worker/job-runner.mjs`
- env
  - `DISCORD_WEBHOOK_ENABLED=1`
  - `DISCORD_WEBHOOK_URL=...`
  - 서버: `/srv/publish-workbench/config/publish-workbench.env`

### 3.5 안정성 개선
- stale lock 복구 (`src/core/runtime/browser-lock.mjs`, `job-runner.mjs`)
- Kakao QR `page.goto` ERR_ABORTED 내성
- `evalOnPage` navigation race retry
- QR 이메일 recipient fallback

---

## 4. 운영 검증 결과

### 4.1 생성/QA
- 키워드 20개 전부 생성
- QA 결과: **20/20 PASS**
- 본문 plain text 대략 2,000~5,500자 수준으로 보강

### 4.2 당일 발행
- 초기 배치: 품질 부족/제목 약함/카테고리 문제 발생
- 재생성 + QA 후 재발행: **8/8 succeeded**
- 카테고리 임시 매핑
  - `IT·테크` → `AI 활용법`
  - `투자·재테크` → `경제상식`
  - `생활·정보` → `마케팅`

### 4.3 예약 큐
서버 큐 상태:
- `2026-07-29.json`: 6 posts
- `2026-07-30.json`: 6 posts

타이머:
- `publish-queue.timer` active
- next: `2026-07-29 08:55:00 CEST`

### 4.4 Discord
- 로컬/서버 웹훅 테스트: HTTP 204 성공

---

## 5. npm scripts

```bash
npm run content:list
npm run content:generate -- --keyword-id invest-01 --skip-image
npm run content:batch -- --count 5
npm run content:qa -- --dir content/generated/2026-07-28
npm run content:market -- "ISA 추천 2026"
npm run schedule:upload -- 2026-07-29.json
npm run schedule:submit -- --queue-dir scheduled/queue --date 2026-07-29 --dry-run
npm run notify:discord-test
```

---

## 6. 환경변수

```bash
# MiMo
LLM_PROVIDER=openai-compat
LLM_API_BASE=https://api.xiaomimimo.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=mimo-v2.5

# Discord
DISCORD_WEBHOOK_ENABLED=1
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_NOTIFY_QA_PASS=0
```

주의:
- `.env.local`은 gitignore
- 커밋에는 예시 파일만 포함

---

## 7. 배포 상태 (ponslink)

배포 대상:
- `scripts/schedule/*`
- `scripts/content/*`
- `scripts/lib/discord-notify.mjs`
- `src/worker/handlers.mjs`
- `src/worker/job-runner.mjs`
- `src/worker/agbrowse-automation.mjs`
- systemd timer/service
- `/srv/publish-workbench/config/publish-workbench.env` (Discord)

서비스:
- `publish-workbench.worker.service` active
- `publish-workbench.web.service` active
- `publish-workbench-xvfb.service` active
- `publish-queue.timer` enabled/active

---

## 8. 남은 과제

1. **신규 카테고리 안정 생성**
   - `투자·재테크`, `IT·테크`, `생활·정보`를 Tistory에 확실히 생성/검증
2. **키워드 재고 확장**
   - 현재 20개 소진, 7/31 이후 자동 발행 재료 추가 필요
3. **생성 자동화 cron**
   - 현재는 발행만 서버 자동, 생성은 로컬/수동 배치
4. **시장 리서치 파서 고도화**
   - 네이버 HTML 구조 변화에 대한 파싱 노이즈 추가 정리
5. **이미지 파이프라인**
   - Codex Imagen/대표 이미지 자동 삽입을 기본 on으로 전환

---

## 9. 결론

- 자는 동안 **예약된 큐가 있으면** 서버가 자동 발행한다.
- 발행 전에는 **스킬 QA + 시장 리서치 QA**를 통과해야 한다.
- 발행 결과는 **Discord로 알림**된다.
- 7/29, 7/30 분은 서버 큐에 적재 완료되어 타이머 기반으로 발행 가능하다.

## 10. 후속 조치 (2026-07-28 오후)

### 본문 잘림 문제 해결
- 원인: `sanitizeHtmlDocumentBody`가 전체 생성 HTML을 첫 문단만 남기고 나머지를 제거
- 수정: `isReadyTistoryHtml`로 완성 HTML 감지, 통과 시 원본 그대로 유지
- 결과: 924-939 전부 본문 2,000~5,500자로 복구

### 중복 글 처리 (924-931 vs 932-939)
- 924-931(초기 배치)과 932-939(재생성 배치)는 동일한 주제 중복
- 삭제는 Tistory UI에서 직접 실행 불가 (행 변경 메뉴의 삭제 버튼이 React 라디오 버튼 형식)
- **대안 적용**: 924-931을 비공개로 전환
  - 에디터 → 완료 → 비공개 label 클릭 → 비공개 저장
  - API 검증: 924-931 visibility=PRIVATE 확인

### 자동 발행 검증
- `publish-queue.timer`: active, 다음 실행 `Wed 2026-07-29 08:55:00 CEST`
- 29일 큐: 6건 (Cursor, Docker, ETF, ISA, 개인연금, 공무원봉급표)
- 30일 큐: 6건 (AI도구, 신용점수, 알뜰폰, 에어컨, 전기차, 정수기)
- Worker: active
