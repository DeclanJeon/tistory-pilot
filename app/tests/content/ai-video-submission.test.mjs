import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { qaQueuePost, submitJob, movePostToDirectory } from '../../scripts/schedule/submit-queue.mjs';
import { updateQueueFile, writeJsonAtomic } from '../../scripts/lib/queue-store.mjs';
import { createHttpServer } from '../../src/server/http-server.mjs';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { createWorkerHandlers } from '../../src/worker/handlers.mjs';

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const makeTmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'aiv-submit-'));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Deterministic real PNG: the byte content (and sha256) varies with seed so
// every fixture image hashes differently; zero-fill padding lifts it over the
// hero-image minimum-bytes threshold used by the publish QA image check.
function makePng(width, height, seed = 0, pad = 2048) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  row[0] = 0;
  row.fill(seed & 0xff, 1);
  const idat = zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
    Buffer.alloc(pad)
  ]);
}

const START_PROMPT = 'Empty garage workshop at dawn, a cardboard rocket on the bench.\nClean single-frame image, no captions, no borders, no text overlays.';
const END_PROMPT = 'The cardboard rocket lifting through the garage skylight.\nSame garage, same lighting, same camera angle as the start frame.';
const FLOW10 = 'Ten-second Frames-to-Video shot: 0-3s solder sparks, 3-7s rocket ignition tremor, 7-10s lift-off through skylight. One slow push-in camera move.';
const FLOW8 = 'Eight-second Veo variant: 0-2s sparks, 2-6s ignition tremor, 6-8s lift-off. Same push-in.';

// 최소 유효 creative fixture — 0 characters, 1 scene. 증거 체인 전부 실제
// 파일+sha로 묶는다 (mock 없이 verifyCreativeEvidence가 그대로 통과해야 한다).
async function buildCreativeFixture(root) {
  const dir = path.join(root, 'project');
  await fs.mkdir(dir, { recursive: true });
  const put = async (rel, data) => {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
    return abs;
  };
  const png = (name, opts) => makePng(640, 360, crypto.createHash('sha256').update(name).digest()[0], opts?.pad ?? 64);
  const img = {};
  const fileOf = (rel, buf) => put(rel, buf).then(() => { img[rel] = buf; });

  await put('prompts/keyframe-scene-1-start.prompt.txt', START_PROMPT);
  await put('prompts/keyframe-scene-1-end.prompt.txt', END_PROMPT);
  for (const [rel, buf] of [
    ['assets/keyframe-scene-1-start.png', png('s1-start')],
    ['assets/keyframe-scene-1-end.png', png('s1-end')],
    ['sheets/storyboard-sheet.png', png('board', { pad: 2048 })],
    ['panels/scene-1-start.png', png('p1s')],
    ['panels/scene-1-start.clean.png', png('p1sc')],
    ['panels/scene-1-end.png', png('p1e')],
    ['panels/scene-1-end.clean.png', png('p1ec')],
    ['overviews/scene-1.png', png('ov1')]
  ]) await fileOf(rel, buf);

  const promptSha = (text) => sha(Buffer.from(text));
  const assets = [
    {
      id: 'keyframe-scene-1-start', kind: 'keyframe', sceneId: 'scene-1', role: 'start',
      path: 'assets/keyframe-scene-1-start.png', sha256: sha(img['assets/keyframe-scene-1-start.png']),
      prompt: START_PROMPT, promptSha256: promptSha(START_PROMPT),
      promptPath: 'prompts/keyframe-scene-1-start.prompt.txt',
      referenceHashes: [], model: 'gpt-image-2.5-flare',
      generatedAt: '2026-10-06T01:01:00Z', width: 1280, height: 720
    },
    {
      id: 'keyframe-scene-1-end', kind: 'keyframe', sceneId: 'scene-1', role: 'end',
      path: 'assets/keyframe-scene-1-end.png', sha256: sha(img['assets/keyframe-scene-1-end.png']),
      prompt: END_PROMPT, promptSha256: promptSha(END_PROMPT),
      promptPath: 'prompts/keyframe-scene-1-end.prompt.txt',
      referenceHashes: [], model: 'gpt-image-2.5-flare',
      generatedAt: '2026-10-06T01:02:00Z', width: 1280, height: 720
    }
  ];
  const reviews = [
    ...assets.map((a) => ({
      assetId: a.id, assetSha256: a.sha256, promptSha256: a.promptSha256,
      verdict: 'pass', observations: ['consistent'], issues: [],
      reviewedAt: '2026-10-06T01:05:00Z', model: 'mimo-v2.5'
    })),
    {
      assetId: 'storyboard-sheet', assetSha256: sha(img['sheets/storyboard-sheet.png']), promptSha256: null,
      verdict: 'pass', observations: ['two panels, captions below'], issues: [],
      reviewedAt: '2026-10-06T01:06:00Z', model: 'mimo-v2.5'
    }
  ];

  const enText = 'This official guide shows how to create a consistent reference prompt, frame the camera shot, and follow each step to assemble a storyboard for video. '.repeat(4);
  const koText = '공식 제작 절차 안내서다. 프롬프트 작성과 참조 이미지 일관성, 프레임 단계별 만들기 방법을 설명한다. 카메라와 장면 생성 가이드를 포함한다. '.repeat(7);
  const sources = [
    { id: 'src-en', url: 'https://flow.example.com/storyboard-guide', finalUrl: 'https://flow.example.com/storyboard-guide', title: 'Storyboard creation guide', language: 'en', retrievedAt: '2026-10-06T00:00:00Z', contentSha256: sha(Buffer.from(enText)), text: enText, sourceKind: 'fetched' },
    { id: 'src-ko', url: 'https://veo.example.kr/캐릭터-스토리보드', finalUrl: 'https://veo.example.kr/캐릭터-스토리보드', title: '스토리보드 제작 프롬프트 안내', language: 'ko', retrievedAt: '2026-10-06T00:00:00Z', contentSha256: sha(Buffer.from(koText)), text: koText, sourceKind: 'fetched' }
  ];

  const panels = [
    { id: 'scene-1-start', sceneId: 'scene-1', role: 'start', assetId: 'keyframe-scene-1-start', path: 'panels/scene-1-start.png', sha256: sha(img['panels/scene-1-start.png']), cleanPath: 'panels/scene-1-start.clean.png', cleanSha256: sha(img['panels/scene-1-start.clean.png']) },
    { id: 'scene-1-end', sceneId: 'scene-1', role: 'end', assetId: 'keyframe-scene-1-end', path: 'panels/scene-1-end.png', sha256: sha(img['panels/scene-1-end.png']), cleanPath: 'panels/scene-1-end.clean.png', cleanSha256: sha(img['panels/scene-1-end.clean.png']) }
  ];
  const project = {
    schemaVersion: 1,
    id: 'aiv-fixture-1',
    contentTrack: 'ai-video',
    state: 'verified',
    recipe: {
      title: 'AI영상제작 튜토리얼: 스토리보드 만들기',
      keyword: 'AI영상제작 튜토리얼',
      synopsis: '캐릭터 없이 한 장면 스토리보드를 만든다.',
      characters: [],
      scenes: [{
        id: 'scene-1', beatId: 'beat-1', shotId: 'shot-1',
        summary: '골판지 로켓이 이륙한다', startState: 'bench', endState: 'lift-off',
        camera: 'slow push-in', spatial: 'garage interior', vfx: 'none', speech: 'none', audio: 'none',
        characterIds: [],
        startImagePrompt: START_PROMPT, endImagePrompt: END_PROMPT,
        flowPrompt10s: FLOW10, flowPrompt8s: FLOW8
      }],
      sourceIds: ['src-en', 'src-ko'],
      adaptationNotes: 'original'
    },
    sources,
    assets,
    reviews,
    sheets: [{ path: 'sheets/storyboard-sheet.png', sha256: sha(img['sheets/storyboard-sheet.png']), panelIds: ['scene-1-start', 'scene-1-end'] }],
    panels,
    sceneOverviews: [{ sceneId: 'scene-1', path: 'overviews/scene-1.png', sha256: sha(img['overviews/scene-1.png']) }],
    historyPath: '.history/operations.jsonl',
    videoGenerated: false,
    renderManifestPath: 'render-manifest.json',
    registration: { postId: 'aiv-fixture-1', publishAt: '2026-10-08T19:00:00+09:00', registeredAt: '2026-10-06T02:00:00Z' }
  };
  const manifest = {
    version: 1,
    sheet: { path: 'sheets/storyboard-sheet.png', sha256: sha(img['sheets/storyboard-sheet.png']), panelIds: ['scene-1-start', 'scene-1-end'] },
    panels: panels.map((p) => ({ id: p.id, sceneId: p.sceneId, role: p.role, path: p.path, sha256: p.sha256, cleanPath: p.cleanPath, cleanSha256: p.cleanSha256 })),
    overviews: project.sceneOverviews,
    thumbnails: []
  };
  await put('render-manifest.json', JSON.stringify(manifest, null, 2));
  const history = [
    { ts: '2026-10-06T00:59:00Z', op: 'imagen', assetId: 'keyframe-scene-1-start', status: 'complete' },
    { ts: '2026-10-06T01:00:00Z', op: 'imagen', assetId: 'keyframe-scene-1-end', status: 'complete' },
    { ts: '2026-10-06T01:05:00Z', op: 'review', assetId: 'keyframe-scene-1-start', status: 'complete', verdict: 'pass' },
    { ts: '2026-10-06T01:06:00Z', op: 'review', assetId: 'storyboard-sheet', status: 'complete', verdict: 'pass' }
  ];
  await put('.history/operations.jsonl', history.map((h) => JSON.stringify(h)).join('\n') + '\n');
  const evidencePath = await put('project.json', JSON.stringify(project, null, 2));

  const P = [
    'AI영상제작 튜토리얼 시리즈 첫 글이다. 실제 제작 환경에서 캐릭터 없이 한 장면의 스토리보드를 만드는 절차를 프롬프트와 결과 이미지 그대로 정리했다. 이 글은 영상 생성이 아니라 시작 프레임, 끝 프레임, 스토리보드 시트까지의 과정만 다룬다. 같은 방식으로 장면을 추가하면 시리즈를 이어갈 수 있고, 각 단계의 산출물을 그대로 공개해 독자가 절차를 재현할 수 있게 하는 것이 목표다. 제작에 쓴 프롬프트 원문과 생성된 이미지, 검토 결과까지 한 글에 모아 두었다.',
    '장면 하나를 재현 가능하게 만들려면 각 단계의 입력과 산출물을 그대로 남겨야 한다. 장면 요약과 카메라 움직임, 시간대별 동작을 먼저 글로 고정한 뒤 프롬프트를 작성했다. 아래 코드 블록의 프롬프트는 생성에 사용한 문자열 그대로다. 어느 한 줄도 바꾸지 않았기 때문에 프롬프트를 그대로 복사하면 같은 조건에서 결과를 다시 확인할 수 있다. 장면 기획은 요약, 시작 상태, 끝 상태 순으로 적는다.',
    '시작 프레임은 장면의 공간과 조명을 잡는 역할을 한다. 아래 이미지는 시작 프레임 프롬프트로 만든 결과다. 프롬프트 본문에 자막이나 테두리를 넣지 말라는 조건을 함께 적어 둔 이유는 패널 조립 시 잔여 텍스트가 남지 않게 하려는 것이다. 차고 작업실이라는 공간 설정과 새벽 조명은 두 프레임이 같은 세계관을 공유하도록 유지해야 하는 기준점이다.',
    '끝 프레임은 같은 공간에서 동작의 결과만 바뀐 화면이다. 시작 프레임과 같은 장소와 같은 카메라 구도를 유지하도록 프롬프트에 명시했다. 두 프레임을 나란히 놓으면 장면의 전후 관계가 한눈에 보인다. 이 작업에서는 골판지 로켓이 이륙하는 순간을 끝 프레임으로 잡았고, 프롬프트에 같은 차고, 같은 조명, 같은 카메라 각도라는 조건을 그대로 유지했다.',
    '두 프레임이 잡히면 하나의 스토리보드 시트로 조립한다. 시트에는 패널 순서가 기록되고, 조립된 시트 이미지는 대표 이미지로도 쓴다. 조립 결과는 검토를 거쳐 패스 판정을 받은 것만 큐에 올린다. 시트 하나에 시작과 끝 패널이 함께 들어가기 때문에 패널 순서만 봐도 장면의 흐름을 알 수 있다. 조립에 사용한 렌더 매니페스트에도 같은 패널 목록이 기록된다.',
    '패널 원본과 자막을 지운 클린 패널을 따로 저장한다. 장면 개요 이미지도 함께 만들어 전체 구성을 확인한다. 모든 산출물은 내용 해시로 기록돼 나중에 변조 여부를 검증할 수 있다. 클린 패널은 화면 위 자막을 제거한 버전으로, 본문에는 원본과 클린 패널을 모두 싣는다. 해시 기록은 파일이 바뀌었는지 확인하는 가장 간단한 방법이다.',
    '플로우 프롬프트는 영상 생성 단계에서 쓸 시간대별 계획이다. 초 단위로 동작과 카메라 이동을 적어 두고, 이 튜토리얼에서는 변형 두 가지만 검증용으로 기록했다. 열 초 계획은 느린 카메라 이동을 포함한 기본형이고, 여덟 초 계획은 같은 동작을 더 짧게 압축한 변형이다. 실제 생성은 하지 않고 계획만 남긴다.',
    '이 글에 생성 영상은 없다. 지금 단계의 목표는 제작 과정과 검증 절차를 재현 가능하게 문서화하는 것이다. 출처: 공식 스토리보드 제작 안내 문서 두 건을 참고해 절차를 정리했다. 참고한 문서는 두 언어의 제작 안내로, 프롬프트 작성법과 프레임 구성 절차를 각각 설명한다. 문서 원문은 그대로 옮기지 않고 절차만 한국어로 다시 정리했다.'
  ];
  const bodyHtml = `<div style="font-size:16px;line-height:1.82;color:#1f2937;">
<h1>AI영상제작 튜토리얼: 스토리보드 만들기</h1>
<p>${P[0]}</p>
<h2>📌 장면 설계</h2>
<p>${P[1]}</p>
<h2>🎬 시작 프레임</h2>
<p>${P[2]}</p>
<pre><code>${START_PROMPT}</code></pre>
<img src="assets/keyframe-scene-1-start.png" alt="시작 프레임">
<h2>🎞️ 끝 프레임</h2>
<p>${P[3]}</p>
<pre><code>${END_PROMPT}</code></pre>
<img src="assets/keyframe-scene-1-end.png" alt="끝 프레임">
<h2>🧩 스토리보드 시트</h2>
<p>${P[4]}</p>
<p>${P[5]}</p>
<img src="sheets/storyboard-sheet.png" alt="스토리보드 시트">
<img src="panels/scene-1-start.png" alt="시작 패널">
<img src="panels/scene-1-start.clean.png" alt="시작 클린 패널">
<img src="panels/scene-1-end.png" alt="끝 패널">
<img src="panels/scene-1-end.clean.png" alt="끝 클린 패널">
<img src="overviews/scene-1.png" alt="장면 개요">
<h2>🔍 플로우 프롬프트</h2>
<p>${P[6]}</p>
<pre><code>${FLOW10}</code></pre>
<pre><code>${FLOW8}</code></pre>
<p>${P[7]}</p>
<div style="background:#fefce8;border:1px solid #fde68a;padding:12px;">인사이트: 프레임과 프롬프트를 해시로 묶어 두면 나중에 다시 검증할 수 있다.</div>
<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px;">정보: 이 트랙은 생성 영상 없이 스토리보드와 제작 절차만 발행한다.</div>
</div>`;
  const bodyFile = await put('article.html', bodyHtml);
  const heroImage = path.join(dir, 'sheets/storyboard-sheet.png');

  const post = {
    id: 'aiv-fixture-1',
    runId: 'aiv-fixture-1',
    title: 'AI영상제작 튜토리얼: 스토리보드 만들기',
    keyword: 'AI영상제작 튜토리얼',
    blogUrl: 'https://acstory.tistory.com',
    category: 'AI·P2P',
    contentType: 'tutorial',
    contentTrack: 'ai-video',
    state: 'verified',
    status: 'qa_passed',
    evidencePath,
    bodyFile,
    bodyHtml,
    heroImage,
    imageRequired: true,
    image: { status: 'ready', method: 'creative-production' },
    requiresProvenance: true,
    sourceBundle: sources,
    ymylRisk: 'none',
    publishAt: '2026-10-08T19:00:00+09:00',
    tags: ['AI영상제작', '스토리보드']
  };
  return { dir, post, evidencePath, bodyHtml };
}

async function writeKeywords(root, list = []) {
  const file = path.join(root, 'keywords.json');
  await fs.writeFile(file, JSON.stringify({ keywords: list }), 'utf8');
  return file;
}

// ─── creative evidence 게이트 ─────────────────────────────────────────────

test('creative post passes keyword gate only when evidence verifies', async (t) => {
  const root = await makeTmpDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const keywordsPath = await writeKeywords(root); // own catalog: nothing matches
  const { post } = await buildCreativeFixture(root);
  const report = await qaQueuePost({ ...post }, { keywordsPath });
  assert.equal(report.ok, true, `failures: ${report.failures.join(' | ')}`);
  assert.ok(!report.failures.some((f) => f.startsWith('keyword-missing')), report.failures.join('|'));
});

test('tampered creative evidence is blocked and the deferred keyword gate returns', async (t) => {
  const root = await makeTmpDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const keywordsPath = await writeKeywords(root);
  const { post, dir } = await buildCreativeFixture(root);
  await fs.appendFile(path.join(dir, 'assets/keyframe-scene-1-start.png'), Buffer.from('tamper'));
  const report = await qaQueuePost({ ...post }, { keywordsPath });
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((f) => f.startsWith('keyword-missing')), report.failures.join('|'));
  assert.ok(report.failures.some((f) => f.includes('creative-evidence:') && f.includes('tampered')), report.failures.join('|'));
});

test('missing creative evidence file fails closed instead of waiving the keyword gate', async (t) => {
  const root = await makeTmpDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const keywordsPath = await writeKeywords(root);
  const { post } = await buildCreativeFixture(root);
  const report = await qaQueuePost({ ...post, evidencePath: path.join(root, 'project', 'no-such.json') }, { keywordsPath });
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((f) => f.startsWith('keyword-missing')), report.failures.join('|'));
  assert.ok(report.failures.some((f) => f.includes('creative-evidence:')), report.failures.join('|'));
});

test('creative post flagged needs_review or bound to an unverified project is blocked', async (t) => {
  const root = await makeTmpDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const keywordsPath = await writeKeywords(root);
  const { post, evidencePath } = await buildCreativeFixture(root);
  const reviewPost = await qaQueuePost({ ...post, state: 'needs_review' }, { keywordsPath });
  assert.equal(reviewPost.ok, false);
  assert.ok(reviewPost.failures.some((f) => f.includes('creative-state:needs_review')), reviewPost.failures.join('|'));

  const project = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
  project.state = 'needs_review';
  await writeJsonAtomic(evidencePath, project);
  const staleProject = await qaQueuePost({ ...post }, { keywordsPath });
  assert.equal(staleProject.ok, false);
  assert.ok(staleProject.failures.some((f) => f.includes('creative-project-state:needs_review')), staleProject.failures.join('|'));
});

test('generic post without a catalog keyword is still blocked, and creative image QA is not waived', async (t) => {
  const root = await makeTmpDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const keywordsPath = await writeKeywords(root, [
    { id: 'it-01', keyword: '네트워크 프로토콜 표준', enabled: true, contentType: 'guide', ymylRisk: 'none' }
  ]);
  const { post } = await buildCreativeFixture(root);
  const generic = { ...post, contentTrack: undefined, evidencePath: undefined, state: undefined, id: 'ghost-99' };
  const report = await qaQueuePost(generic, { keywordsPath });
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((f) => f === 'keyword-missing:ghost-99'), report.failures.join('|'));
  assert.ok(!report.failures.some((f) => f.includes('creative-evidence')), report.failures.join('|'));

  const needsReviewImage = await qaQueuePost({ ...post, image: { status: 'needs_review' } }, { keywordsPath });
  assert.equal(needsReviewImage.ok, false);
  assert.ok(needsReviewImage.failures.includes('image-needs-review'), needsReviewImage.failures.join('|'));

  const noSources = await qaQueuePost({ ...post, sourceBundle: [] }, { keywordsPath });
  assert.equal(noSources.ok, false);
  assert.ok(noSources.failures.some((f) => f.startsWith('provenance-source-missing')), noSources.failures.join('|'));
});

// ─── movePostToDirectory 동시성 ───────────────────────────────────────────

test('concurrent queue move preserves other writers and archive-first semantics', async (t) => {
  const root = await makeTmpDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queueDir = path.join(root, 'queue');
  const submittedDir = path.join(root, 'submitted');
  await fs.mkdir(queueDir, { recursive: true });
  const filename = '2026-10-08.json';
  const file = path.join(queueDir, filename);
  await writeJsonAtomic(file, { runId: 'r1', posts: [{ id: 'creative', contentTrack: 'ai-video' }, { id: 'keep-1' }] });

  const writers = Array.from({ length: 6 }, (_, i) =>
    updateQueueFile(file, (data) => ({ ...data, posts: [...(data?.posts || []), { id: `w-${i}` }] })));
  const moved = movePostToDirectory(queueDir, submittedDir, filename, { id: 'creative' });
  const results = await Promise.all([moved, ...writers]);

  assert.equal(results[0], true);
  const after = JSON.parse(await fs.readFile(file, 'utf8'));
  const ids = new Set(after.posts.map((p) => p.id));
  assert.ok(ids.has('keep-1'));
  assert.ok(!ids.has('creative'));
  for (let i = 0; i < 6; i++) assert.ok(ids.has(`w-${i}`), `writer w-${i} lost`);
  const archived = await fs.readdir(submittedDir);
  assert.equal(archived.length, 1);
  const movedData = JSON.parse(await fs.readFile(path.join(submittedDir, archived[0]), 'utf8'));
  assert.equal(movedData.posts[0].id, 'creative');
  assert.equal(movedData.posts[0].contentTrack, 'ai-video');

  // absent id → false without touching the file
  const before = await fs.readFile(file, 'utf8');
  assert.equal(await movePostToDirectory(queueDir, submittedDir, filename, { id: 'not-there' }), false);
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

// ─── 인증 제출 (실제 workbench HTTP 소비자) ───────────────────────────────

test('authenticated submit reaches the workbench API; no cookie means 401', async (t) => {
  const root = await makeTmpDir();
  const app = await createHttpServer({
    cwd: root,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data',
      PUBLISH_WORKBENCH_WEB_HOST: '127.0.0.1',
      PUBLISH_WORKBENCH_WEB_PORT: '0',
      PUBLISH_WORKBENCH_SESSION_SECRET: 'queue-secret'
    },
    publicSiteQa: async () => ({ surface: { ok: true, blockers: [] } })
  });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const keywordsPath = await writeKeywords(root);
  const { post } = await buildCreativeFixture(root);

  const noCookie = await submitJob({ ...post }, { baseUrl, sessionSecret: '', keywordsPath });
  assert.equal(noCookie.ok, false);
  assert.equal(noCookie.statusCode, 401);

  const badCookie = await submitJob({ ...post }, { baseUrl, sessionSecret: 'wrong-secret', keywordsPath });
  assert.equal(badCookie.ok, false);
  assert.equal(badCookie.statusCode, 401);

  const submitted = await submitJob({ ...post }, { baseUrl, sessionSecret: 'queue-secret', keywordsPath });
  assert.equal(submitted.ok, true, `submit failed: ${submitted.error}`);
  assert.equal(submitted.statusCode, 201);
  assert.ok(submitted.jobId);

  // Evidence can be held after the API accepts a future job.
  const project = JSON.parse(await fs.readFile(post.evidencePath, 'utf8'));
  project.state = 'needs_review';
  await fs.writeFile(post.evidencePath, JSON.stringify(project));
  app.context.config.publishedLedgerPath = path.join(root, 'published.json');
  const job = await new FileJobStore({ paths: app.context.paths }).get(submitted.jobId);
  let browserCalls = 0;
  const handlers = createWorkerHandlers({
    artifactStore: new FileArtifactStore({ paths: app.context.paths }),
    config: app.context.config,
    automation: { publishPost: async () => { browserCalls++; throw new Error('Publication must remain held'); } }
  });
  await assert.rejects(handlers.publish_post({ job, emitEvent: async () => {} }),
    error => error.code === 'creative-evidence-invalid');
  assert.equal(browserCalls, 0);
});
