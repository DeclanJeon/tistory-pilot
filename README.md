# Tistory Agbrowse

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
scp 서버:~/tistory-agbrowse/tmp/kakao-tistory-qr.png ./
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
git clone https://github.com/DeclanJeon/tistory-agbrowse.git
cd tistory-agbrowse
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
