# PonsWarp 회고 시리즈 전달물 지도

## 목표 해석

현재 목표는 아래 전달물이 모두 존재하고, 마지막 공개 검증까지 통과했을 때만 달성된 것으로 봅니다.

1. 시리즈 설계 문서가 파일로 남아 있을 것
2. 각 글의 근거 커밋과 코드 앵커가 파일로 정리돼 있을 것
3. 각 글의 원고가 실제 파일로 작성돼 있을 것
4. Tistory 발행용 HTML 본문이 준비돼 있을 것
5. QA 체크 결과가 파일로 남아 있을 것
6. CLI 발행 입력 파일과 manifest가 준비돼 있을 것
7. 실제 발행 후 공개 링크와 검증 결과가 남아 있을 것

이 문서는 각 전달물의 증거를 어디서 확인할지를 현재 상태 기준으로 고정하기 위한 문서입니다.

## 전달물과 증거 매핑

### A. 설계 문서

핵심 파일:
- `content/ponswarp-retrospective/series-plan.md`
- `content/ponswarp-retrospective/post-08-design-spec.md`
- `content/ponswarp-retrospective/asset-prompts.md`
- `content/ponswarp-retrospective/image-prompts.md`

검증 방법:
- 파일 존재 여부
- 시리즈 구조, 글 구성 규칙, 시각 자료 전략이 들어 있는지 확인

### B. 증거 인덱스

핵심 파일:
- `content/ponswarp-retrospective/evidence-index.md`

검증 방법:
- 글 흐름별 실제 커밋 앵커가 정리돼 있는지 확인
- 로컬 저장소와 관련 저장소 출처가 섞이지 않았는지 확인

### C. 원고 초안

핵심 파일 구조:
- `content/ponswarp-retrospective/drafts/post-01.txt` ~ `post-50.txt`

검증 방법:
- 실제 문단이 존재하는지 확인
- 금지 표현이 없는지 확인
- 제품/서비스 분석 항목이 글마다 포함돼 있는지 확인

### D. 발행용 HTML

핵심 파일 구조:
- `content/ponswarp-retrospective/html/post-01.html` ~ `post-50.html`

검증 방법:
- Tistory HTML fragment 형태인지 확인
- markdown fence가 없는지 확인
- 시각 자료가 data URI 혹은 내장 자산으로 포함돼 있는지 확인

### E. QA 결과

핵심 파일 구조:
- `content/ponswarp-retrospective/qa/post-01.md` ~ `post-50.md`
- `content/ponswarp-retrospective/qa/series-batch-01.md` ~ `series-batch-07.md`

검증 방법:
- 제목, 구조, 근거, 시각 자료, 톤, HTML 형식 점검 여부 확인
- 발행 전 상태가 왜 `REVISE`인지 이유가 명시돼 있는지 확인

### F. 발행 입력 파일

핵심 파일:
- `content/ponswarp-retrospective/publish-manifest.draft.json`

검증 방법:
- 50편 전체가 들어 있는지 확인
- title, slug, category, bodyFile, description, tags가 채워져 있는지 확인
- 각 `bodyFile` 경로가 실제 HTML 파일과 일치하는지 확인

### G. 발행 및 공개 검증

필수 증거:
- CLI 실행 결과
- 카카오 QR 로그인 이후 발행 로그
- 공개 URL 목록
- 공개 페이지 검증 결과

검증 방법:
- 제목 일치
- 카테고리 일치
- 본문 HTML 깨짐 없음
- 이미지 로드 성공
- QA된 HTML과 공개 결과가 일치

## 현재 상태 기준 완료 항목

직접 확인한 현재 증거:
- `drafts/post-*.txt` 50개 존재
- `html/post-*.html` 50개 존재
- `qa/post-*.md` 50개 존재
- `assets/post-*` 50개 존재
- `publish-manifest.draft.json`에 50편 전부 반영
- `publish-manifest.final.json`에 제목 prefix / 홈주제 / 대표이미지 / 예약 시각 반영
- `publish-manifest.batch-2026-06-24.json` 생성 완료 (`post-31` ~ `post-45`)
- `publish-manifest.batch-2026-06-25.json` 생성 완료 (`post-46` ~ `post-50`)
- 금지 표현 검색 통과
- HTML markdown fence 검색 통과
- draft/html 기준 placeholder/TODO 검색 통과
- series publish dry-run에서 메타데이터 포함 batch manifest 인식 확인
- 공개 발행 결과 확인:
  - 공개 완료 `post-01` ~ `post-30`
  - 공개 링크 범위 `https://acstory.tistory.com/873` ~ `https://acstory.tistory.com/902`
- 긴급 수정 결과 확인:
  - `post-01` ~ `post-30` 제목/본문 응급 수복 완료
  - 수정 스크립트: `scripts/repair-ponswarp-retrospective.mjs`
  - 수정 경로 보강:
    - 기존 공개 글 repair는 generic update flow 대신 quick repair path 사용
    - HTML body file은 raw fragment 그대로 주입
  - 수정 검증: headless browser 공개 확인 + 관리자 편집 화면 재진입 확인

## 현재 상태 기준 미완료 항목

아직 남은 것:
- `post-31` ~ `post-45` 실제 공개 발행 실행
- `post-46` ~ `post-50`은 비공개 draft 상태에서 공개/예약 발행으로 전환
- 공개 URL 목록에 `post-31` ~ `post-50` 추가 확보
- 공개 페이지 기준 제목/카테고리/대표이미지/본문 렌더 최종 검증
- 이미 공개된 `post-01` ~ `post-30`의 홈주제 / 대표이미지 메타데이터 보강

현재 blocker:
- 기존 공개본 01-30은 제목/본문 수복은 끝났지만, 대표이미지 입력 제어가 현재 수정 모달에서 직접 드러나지 않는다.
- 신규 공개 발행 쪽은 여전히 티스토리 `post.json` 응답 한도(`하루에 새롭게 공개 발행할 수 있는 글은 최대 30개까지입니다.`)에 막히거나, 한도 이후 예약 공개 모달이 닫히지 않는 문제가 있다.
- 다만 `post-46` ~ `post-50`은 private fallback으로 저장 가능함을 확인했고, 현재 관리자 목록에 비공개 draft로 존재한다.
- 상세 증거와 재실행 명령은 `content/ponswarp-retrospective/qa/scheduled-publish-limit-2026-06-24.md`, `content/ponswarp-retrospective/qa/repair-work-order-2026-06-24.md`, `content/ponswarp-retrospective/qa/public-output-audit-2026-06-24.md`에 기록했다.