# 예약 발행 한도 감사 — 2026-06-24

## 확인 목적
남은 `post-31` ~ `post-50`이 예약 발행 경로에서 막히는 이유를 실제 응답 기준으로 고정합니다.

## 확인 환경
- 블로그: `https://acstory.tistory.com`
- 경로: `https://acstory.tistory.com/manage/newpost`
- 로그인 상태: 카카오 QR 로그인 완료 후 글쓰기 화면 진입
- 브라우저: 로컬 CLI 브라우저 프로필 (`http://127.0.0.1:9222`)

## 실제 요청/응답
예약 발행 모달에서 아래 값이 채워진 상태까지 확인했습니다.
- 제목: `[PonsWarp] 서버 없는 전송이라는 말의 절반만 맞았던 이유`
- 카테고리: `개발 회고`
- 홈주제: `IT 인터넷`
- 예약일: `2026-06-24 09:00`
- 대표이미지: `assets/post-31/backend-responsibility-growth.svg`

그 뒤 `공개 발행`을 눌렀을 때 실제 네트워크는 다음 순서로 나갔습니다.

1. `POST https://acstory.tistory.com/manage/dkaptcha/widgetId` → `200`
2. `POST https://acstory.tistory.com/manage/post.json` → `403`

`post.json` 응답 본문:

> 하루에 새롭게 공개 발행할 수 있는 글은 최대 30개까지입니다.

## 결론
현재 blocker는 캡차 자체가 아니라 **티스토리 공개 발행 일일 한도**입니다.

- 이미 `post-01` ~ `post-30`이 같은 날 공개 발행됐습니다.
- 예약 발행도 `public post` 생성으로 계산돼 같은 한도에 걸립니다.
- 따라서 `post-31` ~ `post-50`은 한도가 리셋된 다음 날부터 다시 밀어야 합니다.

## 실행 계획
- `2026-06-24`: `post-31` ~ `post-45` (15편)
- `2026-06-25`: `post-46` ~ `post-50` (5편)

## 준비된 입력 파일
- `content/ponswarp-retrospective/publish-manifest.batch-2026-06-24.json`
- `content/ponswarp-retrospective/publish-manifest.batch-2026-06-25.json`

## 준비된 CLI
현재 시리즈 CLI는 아래 메타데이터를 실제 발행 옵션으로 읽습니다.
- 제목 prefix
- 카테고리
- 홈주제
- 대표이미지
- 예약 시각
- `--start-at`
- `--count`

예시:

```bash
node scripts/publish-ponslink-series.mjs \
  --manifest content/ponswarp-retrospective/publish-manifest.batch-2026-06-24.json \
  --headless
```

```bash
node scripts/publish-ponslink-series.mjs \
  --manifest content/ponswarp-retrospective/publish-manifest.batch-2026-06-25.json \
  --headless
```
