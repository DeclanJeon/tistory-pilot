# Tistory Pilot

<p align="center">
  <strong>Tistory 자동화 CLI + Codex 블로그 작성 스킬</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white" alt="Node >=20" />
  <img src="https://img.shields.io/badge/Login-Kakao%20QR-FFCD00?logo=kakaotalk&logoColor=000" alt="Kakao QR" />
  <img src="https://img.shields.io/badge/Browser-agbrowse-2563EB" alt="agbrowse" />
  <img src="https://img.shields.io/badge/Skill-tistory--blog-8B5CF6" alt="tistory-blog skill" />
</p>

---

## 이 프로젝트는 무엇인가

Tistory 블로그에 글을 쓰고 발행하는 것을 자동화하는 도구다. 두 가지로 나뉜다:

1. **CLI 자동화** (`scripts/`) — 터미널에서 카테고리 생성, 소스 임포트, 발행까지 한 번에
2. **Codex 스킬** (`.codex/skills/tistory-blog/`) — AI가 글을 쓸 때 스타일/레이아웃 규칙을 적용

---

## Kakao QR 로그인 (핵심)

Tistory는 카카오 계정으로 로그인한다. 이 프로젝트는 **헤드리스 브라우저**에서 카카오 QR 코드 로그인을 지원한다.

### 동작 원리

```
1. CLI가 Tistory 관리자 페이지를 엶
2. 카카오 로그인 페이지로 전환
3. QR 코드 이미지를 추출해서 로컬에 저장
4. 사용자가 카카오 앱으로 QR을 스캔
5. 인증 완료 → 자동으로 글 발행 진행
```

### QR 사용법

**방법 1: 로컬에서 직접 열기**

```bash
# QR 이미지가 저장되는 기본 경로
tmp/kakao-tistory-qr.png

# 브라우저로 열기
xdg-open tmp/kakao-tistory-qr.png
# 또는
open tmp/kakao-tistory-qr.png  # macOS
```

카카오 앱 → 더보기 → 우측 상단 스캔 → QR 코드 스캔

**방법 2: 이메일로 받기**

헤드리스 환경(서버, SSH)에서 사용할 때 QR을 이메일로 받을 수 있다.

`.env` 파일에 설정:

```bash
TISTORY_QR_EMAIL_TO=내이메일@gmail.com
TISTORY_QR_EMAIL_FROM=bot@gmail.com
TISTORY_SMTP_HOST=smtp.gmail.com
TISTORY_SMTP_PORT=587
TISTORY_SMTP_SECURE=0
TISTORY_SMTP_USER=bot@gmail.com
TISTORY_SMTP_PASS=앱비밀번호
```

그리고 실행:

```bash
npm run tistory -- publish \
  --blog-url https:// YOURBLOG.tistory.com \
  --title "제목" \
  --body-file content/post.txt \
  --headless
```

CLI가 QR을 생성하면 지정한 이메일로 발송된다. 폰에서 이메일 열고 QR 스캔.

**방법 3: SSH 원격 접속 시**

```bash
# 서버에서 실행
npm run tistory -- publish --headless ...

# 로컬에서 QR 열기 (SSH 포트 포워딩 또는 scp)
scp 서버:~/tistory-pilot/tmp/kakao-tistory-qr.png ./
open kakao-tistory-qr.png
```

### QR 만료와 갱신

QR 코드는 시간이 지나면 만료된다. CLI는 자동으로 QR을 갱신하고, 갱신된 QR도 이메일로 보낼 수 있다:

```bash
TISTORY_QR_EMAIL_ON_REFRESH=1  # 갱신된 QR도 이메일로 발송
```

### 로그인 유지

한 번 로그인하면 브라우저 세션이 유지된다. 다음 실행 시 QR 없이 바로 발행될 수 있다. 세션이 만료되면 다시 QR 인증이 필요하다.

---

## 빠른 시작

### 1) 설치

```bash
git clone https://github.com/DeclanJeon/tistory-pilot.git
cd tistory-pilot
npm install
```

### 2) 환경 설정

```bash
cp .env.example .env
# .env 파일을 열어서 블로그 URL과 SMTP 설정을 수정
```

### 3) 글 발행

```bash
# 인터랙티브 위저드
npm run tistory

# 또는 직접 발행
npm run tistory -- publish \
  --blog-url https:// YOURBLOG.tistory.com \
  --title "글 제목" \
  --body-file content/post.txt \
  --category "IT·테크" \
  --tags "자동화,Tistory" \
  --headless
```

---

## 주요 명령어

### 글 발행

```bash
#草稿 (발행 안 함)
npm run tistory -- draft \
  --blog-url https:// YOURBLOG.tistory.com \
  --title "제목" \
  --body "본문 내용" \
  --headless

# 바로 발행
npm run tistory -- publish \
  --blog-url https:// YOURBLOG.tistory.com \
  --title "제목" \
  --body-file content/post.txt \
  --category "IT·테크" \
  --headless

# 소스 URL에서 임포트 후 발행
npm run tistory -- publish \
  --blog-url https:// YOURBLOG.tistory.com \
  --source-url https://example.com/article \
  --category "IT·테크" \
  --headless
```

### 카테고리 관리

```bash
# 카테고리가 없으면 자동 생성
npm run tistory -- category ensure \
  --blog-url https:// YOURBLOG.tistory.com \
  --category "개발지식" \
  --headless
```

### 브라우저 관리

```bash
npm run browser:start    # 브라우저 시작
npm run browser:status   # 상태 확인
npm run browser:stop     # 브라우저 중지
```

---

## Codex 스킬: tistory-blog

`~/.codex/skills/tistory-blog/`에 설치된 스킬은 AI가 블로그 글을 쓸 때 자동으로 스타일 규칙을 적용한다.

### 스킬이 하는 일

| 적용 항목 | 내용 |
|-----------|------|
| HTML 구조 | `max-width:800px`, 이모지 섹션 헤더, 다크 코드 박스 |
| 강조 스타일 | 노란 인사이트 박스, 파란 정보 박스, 블록인용 |
| 이미지 | PIL 다이어그램 생성 또는 웹 이미지 사용 |
| 금지 패턴 | `한 줄 요약`, `먼저 핵심만 보자`, 마크다운 문법 |
| 발행 | 브라우저 기반 Tistory 관리자 자동화 |

### 사용법

Codex에서 `$tistory-blog`를 호출하거나, "블로그 글 써줘"라고 하면 스킬이 활성화된다.

```bash
# Codex CLI에서
codex "tistory-blog 스킬로 PonsLink에 대해 글 써줘"

# 또는 키워드로 자동 라우팅
codex "블로그 포스트 작성해줘"
```

### 스킬 구조

```
~/.codex/skills/tistory-blog/
├── SKILL.md                      # 핵심 규칙 + HTML 템플릿
├── agents/openai.yaml            # UI 메타데이터
└── references/
    ├── html-examples.md          # 섹션별 완성 HTML 예시
    ├── image-generation.md       # PIL 다이어그램 생성 코드
    └── tistory-patterns.md       # Tistory 발행 브라우저 패턴
```

### 글쓰기 규칙 요약

1. **이모지 섹션 헤더**: `<h2>`에 ⚙️ 💡 ⚖️ 같은 이모지
2. **인사이트 박스**: 노란 배경 (`#fefce8`)에 💡 핵심 설명
3. **정보 박스**: 파란 왼쪽 보더 (`#3b82f6`)에 부가 설명
4. **블록인용**: 회색 배경에 기울임꼴로 핵심 인용
5. **이미지 캡션**: `<figure>` + `<figcaption>`으로 설명
6. **코드 참조**: 다크 배경 (`#0f172a`) 박스에 📚 읽은 코드
7. **문장 리듬**: 짧은 도입 → 긴 설명 → 강조 박스 교차

---

## 콘텐츠 구조

```
content/
├── ponslink-algorithms/          # 알고리즘 해부 시리즈 (10개)
│   ├── final-bodies/*.txt        # 원고 (텍스트)
│   ├── html/*.html               # 발행용 HTML
│   └── publish-manifest.json     # 발행 기록 (postId 포함)
├── ponslink-deep-dive/           # 심층 분석 시리즈 (10개)
├── ponslink-series/              # 기술 회고 시리즈
└── social-batch/                 # 소셜 미디어 배치
```

### 매니페스트

각 시리즈의 `publish-manifest.json`에 발행 기록이 담긴다:

```json
{
  "seriesTitle": "PonsLink 적용 알고리즘 해부",
  "blogUrl": "https://acstory.tistory.com",
  "posts": [
    {
      "order": 1,
      "title": "[PonsLink 알고리즘 01] WebRTC offer 충돌을 피하는 작은 상태 머신",
      "postId": "856",
      "bodyHtmlFile": "content/ponslink-algorithms/html/..."
    }
  ]
}
```

---

## 수익화 전 공개 표면 QA

자동 발행 타이머는 공개 페이지 QA 결과를 경고·알림으로 기록한다. 제출 API는
`blog-unreachable`·개인 도메인의 `ads-txt-unavailable`만 치명 오류로 차단하며,
기존 글·스킨의 품질 지적은 권고로 유지한다. RSS 실패 시에는 같은 블로그의
숫자 글 ID·`/entry/` 글만 사이트맵에서 추출하고, 카테고리·태그·루트 페이지는
본문 QA 대상으로 세지 않는다. 수동 점검은 다음 명령을 사용한다:

```bash
npm run content:public-qa -- --limit 10 --fail-on-blockers
```

자동 생성 원고와 큐 원고는 구조화된 출처 URL과 본문 내 출처·자료·참고 표시가
필수다. 이전 출처 계약이 없는 `content/generated` 원고는 자동 재큐잉하지
않으므로, 출처를 보강한 새 원고로 교체한다. `*.tistory.com`의 `/ads.txt`
응답은 Tistory가 관리하므로 404만으로 차단하지 않고, 개인 도메인은 별도로
ads.txt를 확인한다.

### 생성·제출·발행의 성공 기준

- 생성 원고의 대표 이미지에는 `src="GENERATED_HERO_IMAGE"`를 사용한다.
  저장 시 실제 생성·확보한 이미지 경로로 치환한다. 존재하지 않는 다른 로컬
  이미지 경로나 확보되지 않은 대표 이미지는 오류로 처리한다.
- 큐 제출 직전에 본문의 로컬 이미지 파일을 확인하고 data URL로 변환한다.
  파일이 없으면 Job을 만들지 않고 검색한 경로를 오류에 남긴다.
- Job 접수는 발행 성공이 아니다. 성공 피드백과 발행 원장은 worker가 실제
  저장 완료 후 기록한다. 원장에는 해당 블로그의 글 URL만 넣으며, 주소를
  확인하지 못하면 `ledger.url-missing` 이벤트를 남기고 빈 URL은 기록하지 않는다.
- 발행 완료 주소는 글쓰기 응답과 관리자 글 목록에서 확인한다.
  `/manage/posts/` 같은 관리자 주소는 발행 주소로 취급하지 않는다.
  저장 응답이 이미 성공한 경우 확인 버튼을 다시 눌러 중복 글을 만들지 않는다.
- 업로드 안내가 `0개의 파일을 업로드 중입니다.`이면 완료 상태로 처리한다.
  남은 파일 수와 실제 업로드 요청을 확인하여 불필요한 120초 대기를 피한다.
- 글 저장 완료는 최대 60초 기다린다. 관리자 화면 이동 중 DOM 평가에는
  탐색 안전 평가를 사용한다. 저장 요청이 발생했지만 완료 확인이 안 되면
  다시 클릭하지 않고 실패를 남겨 중복 발행을 막는다.
- Discord 알림 실패는 원장 기록을 막지 않는다. 큐 제출 오류는
  `publish-queue.sh`의 종료 코드로 전달되어 systemd에서도 실패로 표시된다.
- 테스트는 `PUBLISHED_LEDGER_PATH` 또는 `config.publishedLedgerPath`로 원장을
  격리할 수 있다. 서버 QA에서는 운영 `content/published.json`을 테스트에 사용하지 않는다.

### 매일 새 주제 선정과 중복 방지

- 자동 일일 배치(생활 트랙·AI·P2P 트랙)는 `--regenerate`를 사용하지 않는다.
  QA를 통과한 실생성 원고만 `content/generated/state.json`에 기록하며, 실패한
  원고와 검토용 템플릿은 다음 배치에서 다시 시도한다.
- 생성·큐 등록·제출 단계 모두 `content/published.json`의 기본 키워드 ID와
  키워드·제목을 비교한다. RSS가 실패하거나 오래된 글이 RSS 목록 밖으로 밀려나도
  원장의 주제 비교는 유지된다. 중복을 제외한 후보가 부족하면 발행량을 줄인다.
  제출 상한(`--limit`)은 중복을 제외한 새 주제에만 적용해 과거 중복 큐가
  뒤에 있는 새 글을 가리지 않도록 한다.
- 생성 단계는 유효한 기존 원고·예약 큐·진행 중 작업도 주제 이력으로 확인한다.
  큐 등록·제출은 진행 중 작업과 같은 실행에서 선택한 글을 비교해 다른 ID의
  같은 주제가 동시에 예약되지 않게 한다. 실패한 작업만으로는 발행을 기록하지 않는다.
- 뉴스는 원 기사 URL도 비교한다. `idxno` 같은 기사 식별 쿼리는 보존하고
  `utm_*`·`fbclid`·`gclid`와 fragment만 제거한다. 같은 공식 안내를 참조하는
  별개 가이드는 URL 공유만으로 차단하지 않는다.
- worker는 브라우저 발행 직전에 블로그별 원장을 다시 확인하고 중복이면
  재시도 없이 실패시킨다. 원장이 손상되거나 읽기 오류가 나면 발행을 중단한다.
- 큐의 `id`·`keyword`는 API의 `keywordId`·`keyword`로 전달되어 staged payload와
  worker까지 유지된다. `sourceBundle`은 출처 자료이며 주제 ID 저장소로 사용하지 않는다.
- 원장은 실제 공개 글 URL을 확인한 발행 성공에만 기록하고 작업 ID·출처도 보존한다.
  멱등 키는 공개 URL이므로 같은 주제가 실수로 추가 발행돼도 증거를 잃지 않는다.
  수동 `--regenerate`도 발행·준비된 원고의 주제 검사를 우회하지 않는다.
- 2026-10-07 수정: RSS 타임아웃과 작업 ID 기반 원장이 결합해 동일 뉴스가 매일
  재발행되던 문제를 수정했다. 운영 원장 복구는 성공 작업의 idempotency key와
  제출 기록이 정확히 일치하는 항목에만 적용하며, 기존 게시글은 삭제하지 않는다.
- 2026-10-07 전체 감사: 9월 이후 공개 206건(9월 26·10월 180), 원 키워드 ID
  반복 36개·추가 중복 130건을 확인했다. 반복 그룹의 166건은 모두 서버 성공 작업에
  대응한다. 제목·ID 변형 주제는 이 숫자에 합산하지 않는다.
  전체 목록은 로컬 `records/2026-10-07/publications-and-duplicates.csv`에 보관한다.

## AI 제작 가이드 자동 발행

- `tistory-generate-video.timer`: 매일 **18:30 Asia/Seoul**에 다국어 조사 →
  오리지널 레시피 → 캐릭터·씬 스틸 이미지 → Codex 시각 검수 → 한국어 원고 →
  제작 증빙 검증 → 큐 등록을 실행한다. 영상은 생성하지 않고 Flow 프롬프트만 제공한다.
- 서울 날짜당 최대 1건이다. pending·submitted·failed 등록 이력을 모두 확인하므로
  이미 당일 가이드가 있으면 `daily-cap`으로 종료한다. 검수 완료 후 20분 뒤를
  `publishAt`으로 잡고, `publish-queue.timer`가 매시 00·15·30·45분에 due 원고를
  접수한다. 워커는 `notBefore` 이전에 발행하지 않는다.
- API·staged payload·워커·발행 원장은 `contentTrack`·`evidencePath`를 유지한다.
  제출 직전과 브라우저 발행 직전에 실제 파일·프롬프트·검수 해시와 프로젝트의
  `verified` 상태를 다시 확인한다. 증빙 오류는 재시도 없이 보류한다.
- AI 트랙의 공통 카탈로그 키워드는 개별 실습 주제가 아니다. 제목에서 이 문구를
  제외한 실습 소재를 비교하되, 같은 ID·정규화 제목·유사한 실습의 재발행은 막는다.
  일반 가이드·뉴스의 기존 키워드·원 기사 중복 검사는 유지한다.
- 범용 큐 등록·수동 큐 등록·creative 등록·제출 이동은 같은 파일 락을 사용한다.
  락 안에서 최신 큐와 슬롯 점유를 읽으므로 동시 추가를 잃거나 제출한 글을 되살리지 않는다.
- 큐 서비스는 web·worker에 의존하며 기존 `publish-workbench.env`를 읽어 세션
  쿠키로 API를 인증한다. 로그인 만료나 제작 검수 실패는 자동 발행을 보류한다.
- 운영 서버의 `.codex/skills/`·스킬 manifest, Codex CLI 인증, Python/Pillow·CJK
  폰트는 제작 런타임 의존성이므로 소스 배포·정리 과정에서 제거하지 않는다.

운영 확인과 수동 tick은 서비스의 EnvironmentFile을 그대로 사용하는 명령으로 실행한다:

```bash
ssh ponslink 'TZ=Asia/Seoul systemctl list-timers publish-queue.timer tistory-generate-video.timer --all'
ssh ponslink 'sudo systemctl start tistory-generate-video.service publish-queue.service'
```

2026-10-07 복구 검증: 전체 로컬 테스트 **253/253**, 실제 두 서비스 종료 코드 0.
운영 API는 기존 성공 영수증으로 HTTP 201을 반환했고 작업 수는 **467→467**이었다.
당일 생성은 `daily-cap`, due 원고 5건은 발행 원장 중복으로 차단됐다.
기존 실습 글 `https://acstory.tistory.com/1271`은 HTTP 200, native 이미지 17개·
프롬프트 블록 10개·근거 링크 3개를 유지한다. 검증을 위해 추가 글이나 영상을 발행하지 않았다.

## 서버 배포와 로컬 보관

- 로컬 개발·보관 위치: `C:\Users\Declan\Documents\Projects\tistory-pilot`.
  개발 소스는 `app/`, 원본 서버 스냅샷·백업·이관 검증 기록은 `archives/`와
  `backups/`에 보관한다.
- 서버에는 실행 코드, 런타임 의존성, 필수 설정·프롬프트, 라이선스와 운영
  데이터만 둔다. 인증 세션, 발행 원장, 원고·이미지, 작업 큐와 운영 로그는 유지한다.
- 테스트, 일반 문서, 배포 원본, QA 결과·스크린샷, 백업과 일회성 복구 스크립트는
  로컬에만 보관한다. 로컬 원본과 SHA-256이 일치하는지 확인한 뒤 서버 사본을 제거한다.
- 개발 소스의 기준은 GitHub `DeclanJeon/tistory-pilot`의 `app/`이다.
  서버 실행 소스(`src/`, `scripts/`, `.codex/`)와 package/lock 파일은 로컬과
  동일하게 동기화한다. 테스트·문서·배포 도구는 로컬에 보관하고 운영 서버에서 실행하지 않는다.
  운영 환경변수·인증 세션·`content/`·작업 큐·데이터 디렉터리는 소스 배포에서 제외한다.

---

## 환경 변수

`.env.example`을 `.env`로 복사해서 사용.

| 변수 | 설명 |
|------|------|
| `TISTORY_BLOG_URL` | 블로그 기본 URL |
| `TISTORY_POST_CATEGORY` | 기본 카테고리 |
| `TISTORY_HEADED` | `1`이면 브라우저 창 표시 |
| `TISTORY_QR_IMAGE_PATH` | QR 이미지 저장 경로 |
| `TISTORY_WAIT_FOR_LOGIN_MS` | 로그인 대기 시간 (ms) |
| `TISTORY_QR_EMAIL_TO` | QR 이메일 수신자 |
| `TISTORY_QR_EMAIL_ON_REFRESH` | `1`이면 갱신된 QR도 이메일 발송 |
| `TISTORY_SMTP_*` | SMTP 설정 (QR 이메일용) |
| `TISTORY_ENV_FILE` | 외부 env 파일 경로 (SMTP 재사용) |

---

## 환경 요구사항

- Node.js 20+
- Chrome/Chromium (agbrowse 내장 또는 시스템)
- Tistory 블로그
- 카카오 계정

---

## 프로젝트 구조

```
scripts/
├── tistory-automation.mjs        # 통합 CLI
├── tistory-post.mjs              # 글 작성/발행 자동화
├── tistory-category.mjs          # 카테고리 자동화
├── publish-social-batch.mjs      # 소셜 미디어 배치 발행
└── lib/
    ├── agbrowse-cli.mjs          # agbrowse 래퍼
    ├── source-import.mjs         # 소스 임포트/병합
    └── qr-notify.mjs             # QR 이메일 알림

.codex/
└── skills/tistory-blog/          # Codex 블로그 스킬

content/                          # 콘텐츠 (원고 + HTML)
```

---

## 라이선스

MIT
