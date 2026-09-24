# Live publish audit — 2026-06-23

## Confirmed live publish state
- Posts 01 through 30 were publicly published to `acstory.tistory.com` during the first live batch.
- Those first 30 posts were published before title-prefix / home-topic / representative-image requirements were enforced.
- Manage-posts audit confirmed post 30 is visible and post 31 is not yet visible.

## What was wrong in the first live batch
- Titles were published without the `[PonsWarp]` prefix.
- Home topic was not set.
- Representative image was not set.
- Batch execution was stopped before post 31 after the user pointed out those metadata requirements.

## Flow patches applied after the stop
- Added a final manifest: `content/ponswarp-retrospective/publish-manifest.final.json`
- Added per-post metadata fields:
  - `title` with `[PonsWarp]` prefix
  - `homeTopic: "IT 인터넷"`
  - `representativeImagePath`
  - `schedule` for posts 31-50
- Patched `src/worker/agbrowse-automation.mjs` to support:
  - home-topic selection
  - representative-image upload
  - reserved-date/hour/minute input
  - retry on publish confirmation

## Current blocker
- Immediate publish still works when the daily public-post quota has not been exhausted.
- After posts 01-30 were publicly published on the same day, reserved publish attempts for post 31 stopped closing the publish modal.
- The captured live trace showed:
  - `POST https://acstory.tistory.com/manage/dkaptcha/widgetId` → `200`
  - `POST https://acstory.tistory.com/manage/post.json` → `403`
- The actual `post.json` response body was:
  - `하루에 새롭게 공개 발행할 수 있는 글은 최대 30개까지입니다.`
- That means the blocker is Tistory's **daily public publish quota**, not a missing metadata field.

## Practical state at stop point
- Publicly live: posts 01-30
- Not yet published: posts 31-50
- Source-of-truth manifest for corrected metadata exists and is ready for the remaining posts once the next-day quota window opens.
- Batch manifests for the remaining schedule have been prepared:
  - `content/ponswarp-retrospective/publish-manifest.batch-2026-06-24.json`
  - `content/ponswarp-retrospective/publish-manifest.batch-2026-06-25.json`

## Additional technical evidence
- Detailed response capture and next-step commands were written to:
  - `content/ponswarp-retrospective/qa/scheduled-publish-limit-2026-06-24.md`
- The series CLI was patched to read and apply per-post:
  - `homeTopic`
  - `representativeImagePath`
  - `schedule`
  - `--count` batch slicing for day-by-day publish windows