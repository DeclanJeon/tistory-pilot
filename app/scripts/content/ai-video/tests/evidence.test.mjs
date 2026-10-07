/**
 * evidence.test.mjs — permanent regression tests for the creative evidence
 * gate and production recipe validation. Run with:
 *   node --test scripts/content/ai-video/tests/evidence.test.mjs
 *
 * Builds a complete valid project fixture in a temp dir, then verifies the
 * gate rejects tampered/missing images, tampered prompts, missing panels,
 * unknown reviewer verdicts, unsupported Flow durations, thin source bundles
 * and unbound article markup. No network, no generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyCreativeEvidence } from '../evidence.mjs';
import { validateRecipeForProduction } from '../production.mjs';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const CHAR_PROMPT = 'Character identity sheet for Momo: a round grey cat inventor.\nShow exactly 7 labelled views in one sheet: front, 3/4, profile, back, face close-up, expression study, full-body.\nNeutral studio lighting, plain seamless background, consistent identity across all views, no text outside the view labels.';
const START_PROMPT = 'A cluttered garage workshop at dawn, Momo soldering a cardboard rocket.\nKeep Momo identical to the attached character sheet reference(s). Clean single-frame image, no captions, no borders, no text overlays.';
const END_PROMPT = 'The cardboard rocket lifting off through the garage skylight, Momo cheering.\nKeep Momo identical to the attached character sheet reference(s). Clean single-frame image, no captions, no borders, no text overlays.';
const FLOW10 = 'Ten-second Frames-to-Video shot: 0-3s solder sparks, 3-7s rocket ignition tremor, 7-10s lift-off through skylight. One slow push-in camera move.';
const FLOW8 = 'Eight-second Veo variant: 0-2s sparks, 2-6s ignition tremor, 6-8s lift-off. Same push-in.';

function recipeFixture() {
  return {
    title: '두 고양이의 로켓',
    keyword: 'AI영상제작',
    synopsis: '회색 고양이 모모가 골판지 로켓을 띄운다.',
    characters: [{
      id: 'char-1', name: 'Momo',
      anchors: ['front', '3/4', 'profile', 'back', 'face close-up', 'expression study', 'full-body'],
      description: 'round grey cat inventor', persona: 'curious', imagePrompt: CHAR_PROMPT
    }],
    scenes: [{
      id: 'scene-1', beatId: 'beat-1', shotId: 'shot-1',
      summary: '모모가 로켓을 발사한다',
      startState: 'soldering', endState: 'lift-off',
      camera: 'slow push-in', spatial: 'garage interior',
      vfx: 'N/A — practical sparks only', speech: 'none — silent scene', audio: 'N/A',
      characterIds: ['char-1'],
      startImagePrompt: START_PROMPT, endImagePrompt: END_PROMPT,
      flowPrompt10s: FLOW10, flowPrompt8s: FLOW8
    }],
    sourceIds: ['src-en', 'src-ja'],
    adaptationNotes: 'original story'
  };
}

function sourceFixture() {
  const en = 'This storyboard guide explains how to create character reference images and set camera framing. '.repeat(8);
  const ja = 'キャラクター参照画像を生成してフレームを配置するストーリーボードの作成手順を説明します。'.repeat(12);
  return [
    { id: 'src-en', url: 'https://example.com/en/tutorial', finalUrl: 'https://example.com/en/tutorial', title: 'Storyboard production guide', language: 'en', retrievedAt: '2026-10-06T00:00:00Z', contentSha256: sha(Buffer.from(en)), text: en, sourceKind: 'fetched' },
    { id: 'src-ja', url: 'https://example.jp/ja/tutorial', finalUrl: 'https://example.jp/ja/tutorial', title: 'ストーリーボード作成手順', language: 'ja', retrievedAt: '2026-10-06T00:00:00Z', contentSha256: sha(Buffer.from(ja)), text: ja, sourceKind: 'fetched' }
  ];
}

async function buildProject({ mutate } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aivid-'));
  const put = async (rel, data) => {
    const abs = path.join(dir, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, data);
    return abs;
  };
  const png = (name) => {
    // distinct bytes per file name so each sha is unique and meaningful
    return Buffer.concat([PNG, Buffer.from(name)]);
  };

  // prompt files
  const prompts = {
    'character-sheet-char-1': CHAR_PROMPT,
    'keyframe-scene-1-start': START_PROMPT,
    'keyframe-scene-1-end': END_PROMPT
  };
  const promptSha = {};
  for (const [id, text] of Object.entries(prompts)) {
    await put(`prompts/${id}.prompt.txt`, text);
    promptSha[id] = sha(Buffer.from(text));
  }

  // image files
  const sheetImg = png('character-sheet-char-1');
  const startImg = png('keyframe-scene-1-start');
  const endImg = png('keyframe-scene-1-end');
  const boardImg = png('storyboard-sheet');
  const panelStart = png('panel-scene-1-start');
  const panelStartClean = png('clean-scene-1-start');
  const panelEnd = png('panel-scene-1-end');
  const panelEndClean = png('clean-scene-1-end');
  const overviewImg = png('overview-scene-1');

  await put('assets/character-sheet-char-1.png', sheetImg);
  await put('assets/keyframe-scene-1-start.png', startImg);
  await put('assets/keyframe-scene-1-end.png', endImg);
  await put('sheets/storyboard-sheet.png', boardImg);
  await put('panels/scene-1-start.png', panelStart);
  await put('panels/scene-1-start.clean.png', panelStartClean);
  await put('panels/scene-1-end.png', panelEnd);
  await put('panels/scene-1-end.clean.png', panelEndClean);
  await put('overviews/scene-1.png', overviewImg);

  const sheetSha = sha(sheetImg);
  const assets = [
    {
      id: 'character-sheet-char-1', kind: 'character-sheet', characterId: 'char-1',
      path: 'assets/character-sheet-char-1.png', sha256: sheetSha,
      prompt: CHAR_PROMPT, promptSha256: promptSha['character-sheet-char-1'],
      promptPath: 'prompts/character-sheet-char-1.prompt.txt',
      referenceHashes: [], model: 'gpt-image-2.5-flare',
      generatedAt: '2026-10-06T01:00:00Z', width: 2048, height: 2048
    },
    {
      id: 'keyframe-scene-1-start', kind: 'keyframe', sceneId: 'scene-1', role: 'start',
      path: 'assets/keyframe-scene-1-start.png', sha256: sha(startImg),
      prompt: START_PROMPT, promptSha256: promptSha['keyframe-scene-1-start'],
      promptPath: 'prompts/keyframe-scene-1-start.prompt.txt',
      referenceHashes: [sheetSha], model: 'gpt-image-2.5-flare',
      generatedAt: '2026-10-06T01:01:00Z', width: 1280, height: 720
    },
    {
      id: 'keyframe-scene-1-end', kind: 'keyframe', sceneId: 'scene-1', role: 'end',
      path: 'assets/keyframe-scene-1-end.png', sha256: sha(endImg),
      prompt: END_PROMPT, promptSha256: promptSha['keyframe-scene-1-end'],
      promptPath: 'prompts/keyframe-scene-1-end.prompt.txt',
      referenceHashes: [sheetSha], model: 'gpt-image-2.5-flare',
      generatedAt: '2026-10-06T01:02:00Z', width: 1280, height: 720
    }
  ];

  const reviews = [
    ...assets.map((a) => ({
      assetId: a.id, assetSha256: a.sha256, promptSha256: a.promptSha256,
      verdict: 'pass', observations: ['consistent'], issues: [],
      reviewedAt: '2026-10-06T01:05:00Z', model: 'mimo-v2.5',
      reviewImagePath: a.path, reviewImageSha256: a.sha256, reviewThumb: false
    })),
    {
      assetId: 'storyboard-sheet', assetSha256: sha(boardImg), promptSha256: null,
      verdict: 'pass', observations: ['two panels, captions below'], issues: [],
      reviewedAt: '2026-10-06T01:06:00Z', model: 'mimo-v2.5',
      reviewImagePath: 'reviews/thumbs/storyboard-sheet.jpg', reviewImageSha256: 'a'.repeat(64), reviewThumb: true
    }
  ];

  const project = {
    schemaVersion: 1,
    id: 'test-project',
    contentTrack: 'ai-video',
    state: 'reviewed',
    recipe: recipeFixture(),
    sources: sourceFixture(),
    assets,
    reviews,
    sheets: [{ path: 'sheets/storyboard-sheet.png', sha256: sha(boardImg), panelIds: ['scene-1-start', 'scene-1-end'] }],
    panels: [
      { id: 'scene-1-start', sceneId: 'scene-1', role: 'start', assetId: 'keyframe-scene-1-start', path: 'panels/scene-1-start.png', sha256: sha(panelStart), cleanPath: 'panels/scene-1-start.clean.png', cleanSha256: sha(panelStartClean), width: 1280, height: 720 },
      { id: 'scene-1-end', sceneId: 'scene-1', role: 'end', assetId: 'keyframe-scene-1-end', path: 'panels/scene-1-end.png', sha256: sha(panelEnd), cleanPath: 'panels/scene-1-end.clean.png', cleanSha256: sha(panelEndClean), width: 1280, height: 720 }
    ],
    sceneOverviews: [{ sceneId: 'scene-1', path: 'overviews/scene-1.png', sha256: sha(overviewImg), width: 2600, height: 900, panelIds: ['scene-1-start', 'scene-1-end'] }],
    historyPath: '.history/operations.jsonl',
    videoGenerated: false,
    renderManifestPath: 'render-manifest.json'
  };

  const manifest = {
    version: 1,
    font: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    sheet: { path: 'sheets/storyboard-sheet.png', sha256: sha(boardImg), width: 2600, height: 900, panelIds: ['scene-1-start', 'scene-1-end'] },
    panels: [
      { id: 'scene-1-start', sceneId: 'scene-1', role: 'start', path: 'panels/scene-1-start.png', sha256: sha(panelStart), cleanPath: 'panels/scene-1-start.clean.png', cleanSha256: sha(panelStartClean), width: 1276, height: 716 },
      { id: 'scene-1-end', sceneId: 'scene-1', role: 'end', path: 'panels/scene-1-end.png', sha256: sha(panelEnd), cleanPath: 'panels/scene-1-end.clean.png', cleanSha256: sha(panelEndClean), width: 1276, height: 716 }
    ],
    overviews: [{ sceneId: 'scene-1', path: 'overviews/scene-1.png', sha256: sha(overviewImg), width: 2600, height: 900, panelIds: ['scene-1-start', 'scene-1-end'] }],
    thumbnails: []
  };
  await put('render-manifest.json', JSON.stringify(manifest, null, 2));

  const history = [
    { ts: '2026-10-06T00:59:00Z', op: 'imagen', assetId: 'character-sheet-char-1', status: 'start' },
    { ts: '2026-10-06T01:00:00Z', op: 'imagen', assetId: 'character-sheet-char-1', status: 'complete', sha256: sheetSha },
    { ts: '2026-10-06T01:04:00Z', op: 'review', assetId: 'character-sheet-char-1', status: 'complete', verdict: 'pass' }
  ];
  await put('.history/operations.jsonl', history.map((h) => JSON.stringify(h)).join('\n') + '\n');

  if (mutate) await mutate({ dir, project, put });
  await put('project.json', JSON.stringify(project, null, 2));

  const bodyHtml = [
    '<div class="tt_article">',
    `<h2>캐릭터 시트</h2>`,
    `<pre><code>${CHAR_PROMPT}</code></pre>`,
    `<img src="assets/character-sheet-char-1.png" alt="character sheet">`,
    `<pre><code>${START_PROMPT}</code></pre>`,
    `<img src="assets/keyframe-scene-1-start.png">`,
    `<pre><code>${END_PROMPT}</code></pre>`,
    `<img src="assets/keyframe-scene-1-end.png">`,
    `<pre><code>${FLOW10}</code></pre>`,
    `<pre><code>${FLOW8}</code></pre>`,
    `<img src="sheets/storyboard-sheet.png">`,
    `<img src="overviews/scene-1.png">`,
    `<img src="panels/scene-1-start.clean.png">`,
    `<img src="panels/scene-1-end.clean.png">`,
    `<img src="panels/scene-1-start.png">`,
    `<img src="panels/scene-1-end.png">`,
    '</div>'
  ].join('\n');

  return { dir, projectPath: path.join(dir, 'project.json'), bodyHtml, project };
}

// ------------------------------------------------------------------ tests

test('valid project passes the gate', async () => {
  const { projectPath, bodyHtml } = await buildProject();
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.deepEqual(res.failures, [], `unexpected failures: ${res.failures.join('; ')}`);
  assert.equal(res.ok, true);
});

test('tampered asset image is rejected', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  await fsp.appendFile(path.join(dir, 'assets/keyframe-scene-1-start.png'), Buffer.from('tamper'));
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('tampered')));
});

test('missing keyframe image is rejected', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  await fsp.unlink(path.join(dir, 'assets/keyframe-scene-1-end.png'));
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('asset file missing')));
});

test('tampered prompt file is rejected', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  await fsp.appendFile(path.join(dir, 'prompts/keyframe-scene-1-start.prompt.txt'), ' extra');
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('prompt')));
});

test('edited recorded prompt string is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.assets[1].prompt = 'a completely different prompt';
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('prompt')));
});

test('missing clean panel is rejected', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  await fsp.unlink(path.join(dir, 'panels/scene-1-end.clean.png'));
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('panel file missing')));
});

test('missing panel record is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.panels = project.panels.filter((p) => p.id !== 'scene-1-end');
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('missing panel')));
});

test('unknown reviewer verdict is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.reviews[1].verdict = 'unknown';
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('verdict')));
});

test('missing review for an asset is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.reviews = project.reviews.filter((r) => r.assetId !== 'keyframe-scene-1-end');
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('missing review')));
});

test('unsupported Flow duration is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.recipe.scenes[0].flowPrompt10sSeconds = 12;
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('duration')));
});

test('unsupported flowSpecs model duration is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.recipe.scenes[0].flowSpecs = { flowPrompt8s: { durationSeconds: 6, model: 'Veo 3.1' } };
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('duration')));
});

test('single-language source bundle is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.sources = project.sources.slice(0, 1);
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('language') || f.includes('sources')));
});

test('tampered source content hash is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.sources[0].text = 'rewritten source text';
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('contentSha256')));
});

test('article missing a verbatim prompt is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject();
  const res = await verifyCreativeEvidence({
    evidencePath: projectPath,
    bodyHtml: bodyHtml.replace(START_PROMPT, 'paraphrased prompt text')
  });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('verbatim prompt')));
});

test('article missing a produced image is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject();
  const res = await verifyCreativeEvidence({
    evidencePath: projectPath,
    bodyHtml: bodyHtml.replace('<img src="sheets/storyboard-sheet.png">', '')
  });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('produced image')));
});


test('inlined data-URL image matching content hash passes', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  const sheetBytes = await fsp.readFile(path.join(dir, 'sheets/storyboard-sheet.png'));
  const dataUrl = `data:image/png;base64,${sheetBytes.toString('base64')}`;
  const res = await verifyCreativeEvidence({
    evidencePath: projectPath,
    bodyHtml: bodyHtml.replace('<img src="sheets/storyboard-sheet.png">', `<img src="${dataUrl}">`)
  });
  assert.equal(res.ok, true, res.failures.join('; '));
});

test('videoGenerated true is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => { project.videoGenerated = true; }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('videoGenerated')));
});

test('video artifact in project dir is rejected', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  await fsp.writeFile(path.join(dir, 'render.mp4'), Buffer.from('fake'));
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('video artifact')));
});

test('keyframe referencing a non-sheet hash is rejected', async () => {
  const { projectPath, bodyHtml } = await buildProject({
    mutate: async ({ project }) => {
      project.assets[1].referenceHashes = ['f'.repeat(64)];
    }
  });
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('reference')));
});

test('missing evidencePath returns ok:false without throwing', async () => {
  const res = await verifyCreativeEvidence({ evidencePath: 'does/not/exist/project.json', bodyHtml: '<p>x</p>' });
  assert.equal(res.ok, false);
  assert.ok(res.failures.length > 0);
});

test('corrupt project.json returns ok:false without throwing', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aivid-bad-'));
  const p = path.join(dir, 'project.json');
  await fsp.writeFile(p, '{not json');
  const res = await verifyCreativeEvidence({ evidencePath: p, bodyHtml: '' });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('unreadable')));
});

test('evidencePath may be a directory', async () => {
  const { dir, bodyHtml } = await buildProject();
  const res = await verifyCreativeEvidence({ evidencePath: dir, bodyHtml });
  assert.equal(res.ok, true, res.failures.join('; '));
});

test('missing history file is rejected', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  await fsp.unlink(path.join(dir, '.history/operations.jsonl'));
  const res = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => f.includes('history')));
});

// ------------------------------------------------------- recipe validation

test('validateRecipeForProduction accepts a valid recipe', () => {
  assert.deepEqual(validateRecipeForProduction(recipeFixture()), []);
});

test('validateRecipeForProduction rejects bad shapes', () => {
  const noScenes = { ...recipeFixture(), scenes: [] };
  assert.ok(validateRecipeForProduction(noScenes).some((e) => e.includes('scenes')));

  const fourScenes = {
    ...recipeFixture(),
    scenes: [0, 1, 2, 3].map((i) => ({ ...recipeFixture().scenes[0], id: `s${i}` }))
  };
  assert.ok(validateRecipeForProduction(fourScenes).some((e) => e.includes('scenes')));

  const missingFlow = recipeFixture();
  delete missingFlow.scenes[0].flowPrompt8s;
  assert.ok(validateRecipeForProduction(missingFlow).some((e) => e.includes('Flow')));

  const badCharRef = recipeFixture();
  badCharRef.scenes[0].characterIds = ['ghost'];
  assert.ok(validateRecipeForProduction(badCharRef).some((e) => e.includes('unknown character')));
});

test('a different local file with a recorded basename cannot substitute an output', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  await fsp.mkdir(path.join(dir, 'other'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'other/keyframe-scene-1-start.png'), Buffer.from('unverified-image'));
  const result = await verifyCreativeEvidence({
    evidencePath: projectPath,
    bodyHtml: bodyHtml.replace('assets/keyframe-scene-1-start.png', 'other/keyframe-scene-1-start.png')
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(failure => failure.includes('unrecorded image')));
});

test('an extra remote image is not an evidence bypass', async () => {
  const { projectPath, bodyHtml } = await buildProject();
  const result = await verifyCreativeEvidence({
    evidencePath: projectPath,
    bodyHtml: `${bodyHtml}<img src="https://example.com/untested.png">`
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(failure => failure.includes('unrecorded image')));
});

test('an untested hero image cannot be published alongside verified body images', async () => {
  const { projectPath, bodyHtml, dir } = await buildProject();
  const heroImagePath = path.join(dir, 'untested.png');
  await fsp.writeFile(heroImagePath, Buffer.from('untested-hero'));
  const result = await verifyCreativeEvidence({ evidencePath: projectPath, bodyHtml, heroImagePath });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('hero image is not a recorded output'));
});

test('a failed previous image attempt cannot shadow the current passing review', async () => {
  const fixture = await buildProject({ mutate: ({ project }) => {
    project.reviews.unshift({ ...project.reviews[0], assetSha256: 'f'.repeat(64), verdict: 'fail' });
  } });
  const report = await verifyCreativeEvidence({ evidencePath: fixture.projectPath, bodyHtml: fixture.bodyHtml });
  assert.equal(report.ok, true, report.failures.join('; '));
});

test('unused foreign-language sources cannot satisfy publication coverage', async () => {
  const fixture = await buildProject({ mutate: ({ project }) => {
    project.recipe.sourceIds = ['src-en'];
  } });
  const report = await verifyCreativeEvidence({ evidencePath: fixture.projectPath, bodyHtml: fixture.bodyHtml });
  assert.equal(report.ok, false);
});
