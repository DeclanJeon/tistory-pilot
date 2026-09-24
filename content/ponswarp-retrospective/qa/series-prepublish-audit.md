# PonsWarp 회고 시리즈 전체 사전 발행 감사

## 감사 시점
- 작업 디렉터리: `~/Documents/Develop/Project/tistory-pilot`
- 대상 블로그: `https://acstory.tistory.com`
- 대상 시리즈: `PonsWarp가 만들어진 시간`

## 목표 기준
이 감사는 아래 세 가지를 확인하기 위해 작성합니다.

1. 50편 전체 원고/HTML/QA 산출물이 실제 파일로 존재하는지
2. 발행 manifest가 50편 전체를 정확히 가리키는지
3. 실제 공개 발행만 남은 상태인지

## 파일 수량 확인
- drafts: 50
- html: 50
- qa: 50
- asset_dirs: 50
- manifest posts: 50
- missing orders: 없음

## 정적 QA 확인
- 금지 표현 검색: PASS
- HTML markdown fence 검색: PASS
- draft/html placeholder/TODO 검색: PASS
- 개별 QA 파일: `post-01.md` ~ `post-50.md` 존재
- 배치 QA 파일: `series-batch-01.md` ~ `series-batch-07.md` 존재

## CLI 발행 경로 확인
- `publish-manifest.draft.json` 기준 series dry-run에서 50편 전부 `bodyFormat: "html"`로 인식됨
- `publish-manifest.final.json` 기준으로 제목 prefix / 홈주제 / 대표이미지 / 예약 시각이 반영된 최종 입력 파일을 만들었음
- 추가 batch manifest 생성 완료:
  - `publish-manifest.batch-2026-06-24.json`
  - `publish-manifest.batch-2026-06-25.json`
- 패치된 series CLI는 각 post의 `homeTopic`, `representativeImagePath`, `schedule`을 실제 발행 옵션으로 읽을 수 있음

## 현재 판정
상태: **REVISE**

이유:
- 시리즈 작성과 사전 QA는 끝났습니다.
- `post-01` ~ `post-30`은 실제 공개 발행까지 끝났습니다.
- 그러나 `post-31` ~ `post-50`은 티스토리 일일 공개 발행 한도 때문에 아직 밀지 못했습니다.
- 실제 응답은 `하루에 새롭게 공개 발행할 수 있는 글은 최대 30개까지입니다.` 였습니다.
- 따라서 현재 산출물은 **30편 공개 완료 + 20편 예약 발행 대기 상태**이며, 최종 완료 판정은 아직 내릴 수 없습니다.
- 이후 추가 확인에서 `post-46` ~ `post-50`은 공개 예약 발행 대신 비공개 draft로 저장하는 fallback이 동작함을 확인했습니다. 다만 이는 최종 공개 완료 상태가 아니므로 최종 판정은 그대로 `REVISE`입니다.