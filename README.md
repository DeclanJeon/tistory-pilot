# 🤖 Tistory Automation CLI

<p align="center">
  <strong>Headless Kakao QR login + Tistory posting + source import/merge in one CLI.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white" alt="Node >=20" />
  <img src="https://img.shields.io/badge/CLI-Tistory%20Automation-111827" alt="CLI" />
  <img src="https://img.shields.io/badge/Login-Kakao%20QR-FFCD00?logo=kakaotalk&logoColor=000" alt="Kakao QR" />
  <img src="https://img.shields.io/badge/Browser-agbrowse-2563EB" alt="agbrowse" />
</p>

## ✨ What it does

- 📝 Create Tistory drafts or publish posts from the terminal
- 🔐 Log in with **Kakao QR** in headless mode
- 🗂️ Ensure a Tistory category exists before posting
- 🌐 Import article content from one or more source URLs
- 🖼️ Pull source images and insert inline image blocks automatically
- 🧩 Merge multiple sources into a single summarized post body
- 🛠️ Control the browser with `start / status / stop` subcommands

## 🚀 Quick start

### 1) Install

```bash
npm install
```

### 2) Run the interactive wizard

```bash
npm run tistory
```

### 3) Optional: expose the local binary

```bash
npm link
tistory-automation --help
```

## 📦 Requirements

- Node.js **20+**
- A local Chrome/Chromium-capable environment
- A Tistory blog
- A Kakao account for login
- Network access to source pages and Tistory

## 🧭 Main commands

### Interactive wizard

```bash
npm run tistory
npm run tistory:automation
```

### Draft / publish with direct body

```bash
npm run tistory -- draft \
  --blog-url https://YOURBLOG.tistory.com \
  --title "터미널로 작성한 글" \
  --body "첫 문단\n\n둘째 문단" \
  --headless
```

```bash
npm run tistory -- publish \
  --blog-url https://YOURBLOG.tistory.com \
  --title "바로 발행" \
  --body-file content/post-body.txt \
  --category "IT·테크" \
  --tags "AI,자동화,Tistory" \
  --headless
```

### Body from stdin

```bash
cat body.txt | npm run tistory -- draft \
  --body-stdin \
  --title "stdin 본문 예시" \
  --blog-url https://YOURBLOG.tistory.com
```

### Source import

```bash
npm run tistory -- source https://example.com/article
```

This generates files under `tmp/source-imports/`:

- `<slug>.json`
- `<slug>-body.txt`
- optional downloaded hero image

### Multi-source merge

```bash
npm run tistory -- source \
  https://example.com/article-a \
  https://example.com/article-b
```

### Draft/publish directly from source URLs

```bash
npm run tistory -- draft \
  --blog-url https://YOURBLOG.tistory.com \
  --source-url https://example.com/article-a \
  --source-url https://example.com/article-b \
  --headless
```

```bash
npm run tistory -- publish \
  --blog-url https://YOURBLOG.tistory.com \
  --source-url https://example.com/article-a \
  --source-url https://example.com/article-b \
  --category "IT·테크" \
  --tags "AI,뉴스정리" \
  --headless
```

### Ensure a category exists

```bash
npm run tistory -- category ensure \
  --blog-url https://YOURBLOG.tistory.com \
  --category "시사" \
  --headless
```

This opens Tistory category management, completes Kakao QR login if needed, and creates the category when it is missing.

## 🔑 Headless Kakao QR flow

When login is required in headless mode, the CLI will:

1. open the Tistory editor/login page
2. switch to Kakao QR login
3. save the QR image locally
4. wait for approval
5. continue posting after approval

Default QR path:

```bash
tmp/kakao-tistory-qr.png
```

Open it locally if needed:

```bash
xdg-open tmp/kakao-tistory-qr.png
```

Or email the QR to another device/PC by configuring SMTP and a recipient:

```bash
TISTORY_QR_EMAIL_TO=me@example.com
TISTORY_QR_EMAIL_FROM=bot@example.com
TISTORY_SMTP_HOST=smtp.example.com
TISTORY_SMTP_PORT=587
TISTORY_SMTP_SECURE=0
TISTORY_SMTP_USER=bot@example.com
TISTORY_SMTP_PASS=app-password
```

If you already keep SMTP credentials in another project env file, point this repo at it instead of duplicating secrets:

```bash
TISTORY_ENV_FILE=/home/declan/Documents/Develop/Project/pons_p2p/ponslink-api-infra/.env
```

The QR mailer also accepts shared `SMTP_*` / `SMTP_FROM` values and will reuse `PONSLINK_PROVIDER_DASHBOARD_OWNER_EMAIL` or `CONTACT_EMAIL` as the default recipient when present.

## 🖥️ Browser utilities

```bash
npm run browser:start
npm run browser:status
npm run browser:stop
```

Or:

```bash
npm run tistory -- browser start --headed
npm run tistory -- browser status
npm run tistory -- browser stop
```

## 🗂️ Category utilities

```bash
npm run category:ensure
npm run tistory -- category ensure --blog-url https://YOURBLOG.tistory.com --category "시사" --headless
```

## ⚙️ Environment variables

Copy `.env.example` to `.env` and customize as needed.

| Variable | Purpose |
| --- | --- |
| `TISTORY_ENV_FILE` | Optional external env file to import before local overrides |
| `TISTORY_BLOG_URL` | Base blog URL |
| `TISTORY_POST_TITLE` | Default title |
| `TISTORY_POST_BODY` | Default body |
| `TISTORY_POST_DESCRIPTION` | Default description |
| `TISTORY_POST_TAGS` | Default tags |
| `TISTORY_POST_CATEGORY` | Default category |
| `TISTORY_POST_HERO_IMAGE` | Local hero image path |
| `TISTORY_HEADED` | `1` for visible browser default |
| `TISTORY_QR_IMAGE_PATH` | Saved Kakao QR path |
| `TISTORY_WAIT_FOR_LOGIN_MS` | Login wait timeout |
| `TISTORY_QR_EMAIL_TO` | Optional QR recipient email |
| `TISTORY_QR_EMAIL_ON_REFRESH` | `1` to email refreshed QR images too |
| `TISTORY_QR_EMAIL_SUBJECT_PREFIX` | Email subject prefix for QR notices |
| `TISTORY_QR_EMAIL_FROM` | Sender address for QR email |
| `TISTORY_SMTP_HOST` | SMTP host for QR email delivery |
| `TISTORY_SMTP_PORT` | SMTP port |
| `TISTORY_SMTP_SECURE` | `1` for SMTPS / implicit TLS |
| `TISTORY_SMTP_USER` | SMTP username |
| `TISTORY_SMTP_PASS` | SMTP password / app password |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Shared SMTP compatibility values imported from another project env |
| `TISTORY_SOURCE_URLS` | Comma-separated source URLs |
| `TISTORY_SOURCE_OUTPUT_DIR` | Source artifact output dir |
| `TISTORY_SOURCE_IMAGE_LIMIT` | Inline/source image limit |
| `TISTORY_SOURCE_PARAGRAPHS` | Imported paragraph limit |
| `TISTORY_SOURCE_IMAGE_EVERY` | Insert image every N paragraphs |
| `TISTORY_DOWNLOAD_SOURCE_HERO` | `1`/`0` hero download toggle |

## 🧱 Project structure

```text
scripts/
  tistory-automation.mjs   # unified CLI
  tistory-post.mjs         # Tistory editor automation
  tistory-category.mjs     # category ensure/create automation
  lib/
    agbrowse-cli.mjs       # agbrowse wrapper
    source-import.mjs      # source fetch/import/merge
content/                   # example content assets
assets/                    # example images
```

## 🧪 Verified flows

The current CLI has been exercised for:

- `--help`
- browser `start / status / stop`
- category ensure dry-run against Tistory login page
- dry-run against Tistory login page
- single-source import
- multi-source merge import
- source-driven dry-run configuration
- headless Kakao QR file generation flow

## ⚠️ Notes

- This repo is designed for **local CLI automation**, not hosted serverless execution.
- First-time use may still require QR approval from your Kakao app.
- Source extraction depends on page structure; some sites may need site-specific tuning.
- Package metadata and CLI entrypoints are now arranged for GitHub distribution and npm publish prep.

## 🧪 CI

GitHub Actions runs:

- syntax checks for all CLI scripts
- CLI help verification
- single-source import smoke test
- multi-source merge smoke test

## 📄 License

MIT
