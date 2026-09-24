# PonsWarp 회고 공개본 긴급 수정 작업지시서 — 2026-06-24

## 목적
이미 공개된 `post-01` ~ `post-30`을 수정한다.

수정 목표는 세 가지다.
1. 제목을 모두 `[PonsWarp] - 제목` 형식으로 교정한다.
2. 본문이 설명문 한두 줄만 남은 잘못된 공개본을 실제 HTML 본문으로 교체한다.
3. 홈주제와 대표이미지를 함께 반영한다.

## 현재 공개 상태
- 공개 완료 범위: `https://acstory.tistory.com/873` ~ `https://acstory.tistory.com/902`
- 총 30편
- 카테고리: `개발 회고`

대표 확인:
- `https://acstory.tistory.com/873`
- `https://acstory.tistory.com/902`

공통 문제:
- 제목에 `[PonsWarp]` prefix 없음
- 공개 페이지에 실제 본문이 거의 없고 설명문만 남아 있음
- 홈주제 미반영
- 대표이미지 미반영

## 진행 상태 메모
- 2026-06-24 기준 `post-01` ~ `post-05`는 제목과 본문 교체를 실제로 수정 완료했다.
- 같은 날 추가 보강으로 `post-06` ~ `post-30`도 제목과 본문 교체를 실제로 수정 완료했다.
- 검증은 공개 페이지 headless 브라우저 확인과 관리자 편집 화면 재진입 확인을 함께 사용했다.
- `read` 기반 reader snapshot은 수정 직후 예전 공개본을 계속 보여줄 수 있어서 단독 증거로 쓰지 않는다.
- 현재 자동 수정 스크립트는 `scripts/repair-ponswarp-retrospective.mjs`다.
- 2026-06-24 추가 패치:
  - 기존 공개 글 수정은 메타데이터 전체 편집보다 제목/본문 응급 수복 경로를 우선 사용한다.
  - HTML body file은 generic body builder를 거치지 않고 raw HTML fragment 그대로 편집기에 넣는다.
  - 기존 글 수정 화면에서는 generic update flow가 dirty state를 안정적으로 만들지 못해 저장 요청이 누락됐고, quick repair path로 우회해 해결했다.
- 홈주제/대표이미지 같은 메타데이터는 기존 수정 모달에서 제어점이 여전히 불안정해서 후속 보강 대상으로 남긴다.

## 근거
### 공개 출력 확인
`https://acstory.tistory.com/873`과 `https://acstory.tistory.com/902` 공개 페이지를 읽어보면, 실제 HTML 본문 대신 짧은 설명문만 보인다.

### 발행 당시 내부 결과
`content/ponswarp-retrospective/publish-results/batch-live.json`의 초기 결과를 보면 다음 징후가 있다.
- `fillResult.bodyLength`가 대체로 100자 안팎이다.
- 실제 `content/ponswarp-retrospective/html/post-XX.html` 파일 길이와 전혀 맞지 않는다.
- 즉 발행 당시 본문 주입 경로가 전체 HTML이 아니라 아주 짧은 내용만 편집기에 전달했거나, 편집기 상태 동기화가 깨졌다.

### 이후 예약 발행 추적
예약 발행 실험에서는 `POST /manage/post.json` 요청 본문의 `content`가 `<p data-ke-size="size16"></p>` 수준으로 비는 현상도 재현됐다.
- 파일: `content/ponswarp-retrospective/qa/post-31-daily-limit-response.json`
- 이건 현재 발행 경로도 본문 동기화 보강이 필요하다는 뜻이다.

## 수정 대상 입력 파일
### 1. 게시글 매핑
- `content/ponswarp-retrospective/publish-results/repair-manifest-01-30.json`

이 파일에는 아래가 들어 있다.
- `order`
- `url`
- `currentTitle`
- `desiredTitle`
- `bodyFile`
- `category`
- `homeTopic`
- `representativeImagePath`
- `tags`

### 2. 정본 HTML
- `content/ponswarp-retrospective/html/post-01.html` ~ `post-30.html`

### 3. 메타데이터 정본
- `content/ponswarp-retrospective/publish-manifest.final.json`

## 수정 요구사항
### 제목
모든 공개 글 제목을 아래 형식으로 수정한다.
- `[PonsWarp] - 왜 나는 계속 파일 전송 프로젝트를 만들었나`
- 즉 prefix 뒤에 공백 하나가 아니라 `"[PonsWarp] - "` 문자열을 붙인다.

주의:
- 현재 `publish-manifest.final.json`은 `[PonsWarp] 제목` 형태다.
- 수정 전에 이 manifest 제목도 모두 `[PonsWarp] - 제목` 형식으로 먼저 교정해야 한다.

### 본문
- 공개 페이지의 설명문만 남아 있는 상태를 버리고
- `html/post-XX.html`의 실제 fragment 전체를 본문으로 넣는다.
- 설명문은 excerpt 수준으로만 남고, 본문은 구조/이미지/표/인사이트 박스가 전부 보여야 한다.

### 메타데이터
- 카테고리: `개발 회고`
- 홈주제: `IT 인터넷`
- 대표이미지: `representativeImagePath`
- 태그: repair manifest 기준

## 기술 작업 순서
1. `publish-manifest.final.json`의 `post-01` ~ `post-50` 제목을 `[PonsWarp] - 제목` 형식으로 바꾼다.
2. `repair-manifest-01-30.json`을 기준으로 공개본 30편 수정 스크립트를 만든다.
3. 수정 스크립트는 새 글 발행이 아니라 **기존 post id 편집 저장** 경로를 사용해야 한다.
4. 편집기 본문 주입 후 실제 `post.json` payload의 `content` 길이를 검사한다.
   - 한 줄 설명문 수준이면 실패로 본다.
   - 최소한 대응 HTML fragment가 실질적으로 들어가야 한다.
5. 수정 저장 후 공개 URL을 다시 읽어 제목과 본문을 검증한다.

## 강제 검증 항목
각 수정 후 반드시 확인한다.
- 공개 제목이 `[PonsWarp] - ...` 형식인가
- 설명문만 보이지 않고 실제 본문 섹션들이 보이는가
- 본문 안 data URI 이미지가 렌더되는가
- 카테고리가 `개발 회고`인가
- 대표이미지가 설정됐는가
- 홈주제가 `IT 인터넷`인가

## 우선 순위
1. `post-01` 한 편으로 수정 경로 검증
2. `post-02` ~ `post-05` 소규모 배치
3. `post-06` ~ `post-30` 일괄 수정
4. 공개 재검증 문서 업데이트

## 함께 갱신할 문서
수정 작업 후 아래 파일도 갱신한다.
- `content/ponswarp-retrospective/qa/public-output-audit-2026-06-24.md`
- `content/ponswarp-retrospective/qa/live-publish-audit-2026-06-23.md`
- `content/ponswarp-retrospective/delivery-map.md`

## 현재 판정
상태: **긴급 수정 필요**

이 작업은 새 발행보다 우선이다.
이미 공개된 30편이 잘못된 제목과 빈 본문 상태이기 때문이다.
