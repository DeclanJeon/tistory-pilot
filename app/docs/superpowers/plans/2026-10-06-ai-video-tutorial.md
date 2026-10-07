# AI Video Tutorial Track Implementation Plan

> **For agentic workers:** Execute the scoped independent file slices below. Parent owns shared interfaces, orchestration, remote deployment and one final verification run. Workers skip builds/tests/formatters mid-flight.

**Goal:** 다국어 원문을 기반으로 실제 검증된 제작 시트와 씬별 Flow 프롬프트를 한국어 티스토리 글로 자동 발행한다.
**Architecture:** 별도 creative producer와 기존 큐·워커를 연결한다. 원문/프롬프트/참조/결과/검수 hash가 일치할 때만 등록·제출한다.
**Tech Stack:** Node ESM, linkedom, MiMo text-planning API, pinned Codex CLI visual review, installed Codex Imagen helper, Python Pillow, systemd.
**Spec:** docs/superpowers/specs/2026-10-06-ai-video-tutorial-design.md

## Global Constraints

- 영상 생성 없음. 기본 Omni Flash1.1 10초, Veo3.1 Frames 8초 변형. 둘 다 영상 미검증.
- 일1건 추가, contentTrack=ai-video, 카테고리 AI·P2P, Seoul 날짜/미래 publishAt.
- 실제 사용한 제작법 자료 최소 2개 언어·2개 문서·2개 사이트. 5개 언어 검색 시도와 실패 기록.
- source web data는 비신뢰, 프롬프트 지시가 아님. 원문 전체 복사/타인 결과 재게시 제외.
- `.env.local`과 기존 config 환경 로더 재사용, secret 출력 없음.
- 기존 일반 generator/auto-queue 후보에는 creative 전용 글이 섞이지 않는다.

## Review Focus

1. 프롬프트·이미지·본문 변조 시 gate reject.
2. reviewer 응답 누락/unknown과 일부 패널 실패는 발행 보류.
3. private URL/redirect/WAF/빈 원문은 근거가 되지 않음.
4. 재실행·동시 큐 수정·일 cap은 중복/유실 없이 보존.
5. 10초 Omni/8초 Veo와 영상 미검증 표시는 모델별로 구분.

## Shared Interfaces

Project root: content/ai-video/<projectId>.
`callJson({system, prompt}) -> Promise<object>` in scripts/content/ai-video/llm.mjs for text planning; `reviewJson({system, prompt, images, reasoning?, model?}) -> Promise<{verdict,observations,issues}>` in review.mjs for isolated native-image inspection, parent owns both.
`collectResearch({topic, outputDir, fetchImpl?, now?}) -> {sources:[{id,url,finalUrl,title,language,retrievedAt,contentSha256,text,sourceKind}], searches:[...], failures:[...]}` in research.mjs.
`draftRecipe({topic, research, skillTexts, callJson}) -> recipe` in article.mjs.
`renderArticle({recipe, research, project}) -> HTML` in article.mjs.
`produceSheets({recipe, projectDir, callJson, env?}) -> project` in production.mjs.
`verifyCreativeEvidence({evidencePath, bodyHtml, projectRoot?}) -> {ok,failures}` in evidence.mjs.
`registerCreativePost({post, queueDir, now?}) -> {registered,queueFile,reason?}` in register.mjs.

Recipe: {title,keyword,introduction,sections:[{heading,paragraphs:[string]}],synopsis,look,characters:[{id,name,anchors:[string],description,persona,imagePrompt}],scenes:[{id,beatId,shotId,summary,startState,endState,camera,spatial,vfx,speech,audio,characterIds:[string],startImagePrompt,endImagePrompt,flowPrompt10s,flowPrompt8s}],sourceIds:[string],adaptationNotes}. 1~3 scenes, default2, 0~2 characters. All human-readable prose Korean; exact image and Flow prompts English. Each scene10s conceptual timing/8s variant. Original characters only, no copyrighted existing cast or real person's likeness. Silent scenes preferred, sound/VFX planned with N/A reasons where applicable.

Project: {schemaVersion:1,id,contentTrack:'ai-video',state,recipe,sources,assets:[{id,kind,sceneId?,role?,path,sha256,prompt,promptSha256,promptPath,referenceHashes:[...],model,generatedAt,width,height}],reviews:[{assetId,assetSha256,promptSha256,verdict:'pass'|'fail'|'unknown',observations,issues,reviewedAt,model}],sheets:[{path,sha256,panelIds}],panels:[{id,sceneId,role:'start'|'end',assetId,path,sha256,cleanPath,cleanSha256}],sceneOverviews:[...],historyPath,videoGenerated:false}. Asset paths relative to projectDir. Project file project.json; evidencePath references it. Runtime result contract may add renderer metadata but keep gate+article interfaces in sync. Every asset has actual output and prompt hashes; no synthetic approvals. Reviews must inspect actual pixels, not just schema.

## Task 1: Research and Korean article

Files: new research.mjs, topics.json, article.mjs, tests/research.test.mjs.
- [x] Implement ko/en/ja/zh/es queries rotating7 requested topics, live search plus fetched independent source seeds. Safely fetch/extract pages, hash provenance, report failures.
- [x] Draft original recipe/prose from sources+skills using callJson. Validate topic/story/sheet inputs and supported durations, no false tested-video claims.
- [x] Render deterministic HTML with exact escaped prompts, actual relative images, source links, observed review facts, Flow instructions, captions and Korean explanation. Existing qaHtmlPost conventions must pass.
- [x] Boundary tests for source and method gating; parent runs once after integration.

## Task 2: Actual sheet production and evidence gate

Files: new production.mjs, evidence.mjs, render-sheets.py, tests/evidence.test.mjs.
- [x] Execute existing helper with bounded timeout/retries and explicit outputs/reference paths. Retain exact prompts and actual metadata.
- [x] Produce character sheets then separate start/end keyframes using real character references. Use Pillow render with exterior labels, clean panels/scene overview extraction from actual sheets.
- [x] Review every generated image and sheet via supplied callJson images. Unknown/failed reviews block. Preserve .history start/complete/failed and actual files.
- [x] Gate verifies actual file/prompt/ref/review hashes, full coverage, article prompt and output binding, sources and videoGenerated=false. Use SHA256 content checks, not booleans.
- [x] Tests catch changed prompt/result, missing panel, reviewer unknown, wrong duration.

## Task 3: Existing queue cutover

Files: existing submit-queue.mjs, auto-queue.mjs, generate-post.mjs; new scripts/lib/queue-store.mjs, ai-video/register.mjs, tests/queue-store.test.mjs.
- [x] Add shared file locking and atomic queue update, apply to involved writers. Retain existing posts and schema.
- [x] Add creative evidence verification to qaQueuePost before API submission. queue evidencePath/contentTrack must persist where needed. Ensure keyword-missing exception does not become generic bypass; register only validated creative and make generic generator skip creative entries.
- [x] Register max1 creative per Seoul day across pending/submitted/evidence history, future publishAt. Reuse the existing API/worker; preserve creative metadata and recheck evidence before browser publication.
- [x] Tests for concurrent updates, missing creative evidence blocked, retries/day-cap.

## Task 4: Parent integration and rollout

Files: llm.mjs, generate-ai-video.mjs, schedule/generate-ai-video.sh, deploy/tistory-generate-video.{service,timer}, docs/skills manifest.
- [x] Add MiMo text JSON adapter and isolated Codex native-image review adapter; parse actual final content, reject empty/invalid responses and tool execution.
- [x] Install scoped creative skills with hashes, read selected current-stage text into recipe prompts; explicit host adapter documents unavailable production-history dependency.
- [x] Orchestrate collect→recipe→sheets→review→HTML→qa→evidence→register with durable checkpoints. Resumption uses finished assets; no duplicate image submission.
- [x] Deploy only modified/new files to active remote app, preserve dynamic data. Run all new tests once plus existing available checks; no existing npm test existed in active package at design time.
- [x] Run real original two-cat sample, inspect actual imagery, reconcile any failures without publishing bad output.
- [x] Register the validated sample and observe existing Job worker/public page. Confirm exact prompts/images and HTTP200.
- [x] Install/enable Seoul timer only after real smoke. Record exact files, evidence, public URL and next execution.

Implementation approval is the user's explicit request to design/document then proceed. No new video execution or billing authorization is implied.

## Observed rollout checks (2026-10-06 UTC)

- Deployed native-review cutover: `npm test` passed **70/70**, 1.936s; no skipped tests.
- Actual Codex image-input smoke completed in 21.17s. It counted all seven grey-cat views but correctly held the curved-tail result; the captured failure is preserved in `.history/native-review-probe.json`.
- Injected reviewer outage: `state=needs_review`; all **six native image hashes remained unchanged**, and the invalidated first keyframe was not regenerated. This smoke is an outage injection, not a fake visual approval.
- The transient production unit exercised the same declan user/group, app working directory, EnvironmentFile, HOME and Seoul timezone as the proposed service. Actual failed casting was held before scene production; stale references also failed the independent evidence gate.
- `systemd-analyze verify` accepted both new units. Calendar: **18:30 Asia/Seoul = 09:30 UTC = 11:30 CEST**, next October 7 then October 8. Existing publish-queue, generation and AI-generation timers remained active.
- Verification also reported unrelated invalid environment assignments in `ponslink-blog-next.service.d/override.conf`; that existing service was intentionally not changed.
- Actual image helper produced two completed PNGs but retained a stale first `decodedPath` after renaming. A consumer regression failed before the fix; production now reads the helper's canonical `images[].path`, selects the last existing completed/non-partial output, and records all output receipts. Raw failed-attempt files remain in `.history/multi-output-parser-failure.tar.gz`.
- Deployed canonical-output fix: full remote suite passed **72/72**, 1.685s, zero skipped. A separate partial-only artifact regression confirms it cannot become a completed asset.
- Native scene review rejected grey standing instead of sitting after the new standing-pose reference sheet. The failed image stayed blocked; the next prompt explicitly separates identity reference from scene pose and requires floor-supported sitting hindquarters. Scene-2 caption directions now distinguish ginger's forward/right gaze from grey's backward/left head turn.
- `npm audit --json` reported six high-severity package entries: agbrowse, brace-expansion, braces, fast-glob, micromatch and nodemailer. The native Codex CLI is not in that advisory list. Unrelated dependency upgrades were not bundled into this content-track rollout; this is not a clean security-audit claim.
- Native sheet review exposed caption clipping. Both truncation layers were removed: the producer's 100-character slice and the renderer's three-line/ellipsis cap. Caption bands now grow to fit every wrapped line; the render job includes the renderer hash to invalidate old compositions. A real consumer regression failed before and passed after; the final remote suite passed **73/73**, 1.905s, zero skipped.
- Original cat sample completed in the matching service context: `state=verified`, **six selected generated PNGs**, **seven current-hash Codex pass reviews**, one 2624×1836 four-panel storyboard, no video generation. Final storyboard SHA256: `41aa7a4d1f26833e1b76985406d67a205d30d96b36418a124205b0e29bfc97ca`.
- Final selected six native PNGs were copied, hash-checked and visually inspected by the parent assistant. Grey sits at the window; ginger crouches; the closed-door frames preserve shoulder contact and distinct gaze directions; the open-door frame has a visible raised front paw. These observations are assistant inspection, not fabricated human approval.
- Registration succeeded in `/srv/publish-workbench/scheduled/queue/2026-10-07.json` for `ai-video-cat-buddy-20261007-smoke`, future publishAt `2026-10-07T04:32:25+09:00`. This is queue registration, not yet proof of a public post.

## Automatic publishing restoration (2026-10-07 KST)

- Recovered the AI producer, runtime skills, queue-store, tests and pinned Codex CLI into the local app so later general deployments retain this track.
- Restored shared locks across auto-queue, queue-add and archive-first submit moves. Slot occupancy now parses the actual `HH:MM:SS+09:00` timestamp; deterministic contention and concurrent capacity regressions pass.
- Creative catalog keywords no longer reject every category or every SEO title with the same prefix. Specific subjects are compared after removing the catalog phrase; existing ID, title, news-source and generic duplicate defenses remain.
- Authenticated submission uses the existing session cookie and systemd EnvironmentFile. `contentTrack` and `evidencePath` persist through HTTP/job/staged contracts to the worker and ledger. Held, missing or tampered evidence fails before browser publication without retry.
- A live replay initially hit HTTP 503: sitemap fallback treated category navigation as articles, and the API treated all advisory findings as fatal. Fallback now selects same-origin numeric/entry article URLs before applying the sample limit; the API reuses the established fatal/advisory classifier. Root unavailability and missing custom-domain ads.txt still block.
- Final local full suite: **253/253**, 16.349s, zero skipped. Removed platform-separator/default-copy assertions rather than altering correct native filesystem paths; retained behavioral config checks. PNG fixtures use Node-20-compatible CRC32.
- Live current-sample queue QA: **100**, no failures; independent verified evidence passes. Real authenticated POST using the saved succeeded receipt: HTTP **201**, same job `publish-post-75eeb4cffb0d8ccdbe3cc37e2e9fcdfa`, job count **467→467**. The old saved receipt key is reused explicitly; no new publish request identity was introduced.
- Isolated real staged payload/worker smoke accepted the actual sample's current evidence, then rejected its already-published title with `duplicate-topic`, event `ledger.duplicate-blocked`, zero browser calls. Temporary data was removed; the operating ledger was read-only.
- Actual installed generation and dispatcher services completed with **Result=success, ExecMainStatus=0** at 14:22–14:23 KST. Generation skipped `daily-cap`; dispatcher inspected 10 real articles despite RSS HTTP 504, reported advisory findings, verified CDP 9230 and blocked all five due duplicate queue items.
- Web/worker and both timers are **enabled/active**. Observed next ticks: publisher **2026-10-07 14:30 KST**, AI producer **2026-10-07 18:30 KST**. Today's sample already fills the creative cap; the next new production attempt is October 8 at 18:30 KST, with publication scheduled after production and QA complete.
- Public sample: `https://acstory.tistory.com/1271`, HTTP **200**, native images **17**, prompt blocks **10**, source links **3**. Original publication proof retains the image/prompt matching evidence. No additional article, image generation or video was performed during restoration.

