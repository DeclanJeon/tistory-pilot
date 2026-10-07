/**
 * tests/research.test.mjs — 다국어 수집과 제작 레시피의 경계 테스트.
 *
 * 범위: 공개-안전 fetch/리다이렉트/사설주소 차단, 페이지 검증, 언어 판별,
 * 다국어 수집 게이트(2페이지·2언어), 레시피 검증.
 * 네트워크는 fetchImpl/addressLookup 주입으로 대체한다 — 실제 외부 요청 없음.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  collectResearch,
  loadTopics,
  selectTopic,
  isPrivateHost,
  detectLanguage,
  verifyPage,
  documentIdentity,
  safeFetch,
  SEARCH_LANGUAGES,
  SEARCH_ENGINES,
  isProductionMethodSource, productionSourceCoverage
} from '../scripts/content/ai-video/research.mjs';

import {
  draftRecipe,
  validateRecipe,
  checkFlowCapabilities,
  CHARACTER_ANCHORS
} from '../scripts/content/ai-video/article.mjs';

const PUBLIC_ADDR = async () => ['93.184.216.34'];

function htmlPage({ title = 'Test page', body = '', lang = 'en' } = {}) {
  const filler = {
    en: 'This guide explains how to build a consistent character reference and split a video into short scenes. '.repeat(30),
    ko: '이 문서는 일관된 캐릭터 참조 시트를 만들고 영상을 짧은 씬으로 나누는 방법을 설명한다. '.repeat(30),
    ja: 'このガイドでは一貫したキャラクター参照シートの作り方と動画を短いシーンに分割する方法を説明します。'.repeat(30),
    zh: '本指南介绍如何制作一致的角色参考表并将视频拆分为短场景。'.repeat(30),
    es: 'Esta guía explica cómo crear una hoja de referencia de personaje y dividir el vídeo en escenas cortas para la producción. '.repeat(30)
  };
  return `<!doctype html><html><head><title>${title}</title><meta property="og:title" content="${title}"/></head><body><article><h1>${title}</h1><p>${body || filler[lang] || filler.en}</p></article><script>alert(1)</script></body></html>`;
}

function fakeResponse({ status = 200, body = '', contentType = 'text/html; charset=utf-8', headers = {} } = {}) {
  const map = new Map(Object.entries({ 'content-type': contentType, ...headers }));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => map.get(k.toLowerCase()) || null },
    async arrayBuffer() { return new TextEncoder().encode(String(body)).buffer; },
    body: { cancel: async () => {} }
  };
}

/** URL → response 매핑 fetch. 호출 기록을 남긴다. */
function makeFetch(routes, { fallback } = {}) {
  const calls = [];
  return async (url) => {
    calls.push(String(url));
    const key = Object.hasOwn(routes, String(url)) ? String(url) : Object.keys(routes).find(k => String(url).startsWith(k));
    if (!key) {
      if (fallback) return fallback(url);
      const err = new Error(`network-blocked: ${url}`);
      err.code = 'ENOTFOUND';
      throw err;
    }
    const route = routes[key];
    if (typeof route === 'function') return route(url);
    return route;
  };
}

const topic = {
  id: 'cat-buddy-comedy',
  name: '두 고양이 버디 코미디',
  keyword: '고양이 AI 영상 제작',
  queries: { ko: 'qko', en: 'qen', ja: 'qja', zh: 'qzh', es: 'qes' },
  seeds: ['https://helpx.adobe.com/kr/firefly/seed-ko', 'https://support.google.com/flow/answer/16352836?hl=en']
};

function ddgResultsPage(urls) {
  return fakeResponse({
    body: `<html><body>${urls.map((u) => `<a class="result__a" href="${u}">r</a>`).join('')}</body></html>`
  });
}

const FLOW_DOC_TEXT = 'Gemini in Flow. Omni Flash 1.1 supports Text to video, Frames to video and Ingredients with 4, 6, 8, or 10 second outputs. Veo 3.1 Lite, Fast and Quality support 4, 6, 8 second clips; Ingredients supports 8 seconds only. ';

// ─── 주소/주제 단위 테스트 ────────────────────────────────────────────


test('selectTopic은 서울 날짜 기준으로 순환하고 id로도 해석한다', async () => {
  const topics = await loadTopics();
  const a = selectTopic({ topics, now: new Date('2026-10-06T00:00:00Z') });
  const b = selectTopic({ topics, now: new Date('2026-10-07T00:00:00Z') });
  assert.notEqual(a.id, b.id);
  assert.equal(selectTopic({ topics, topicId: 'absurd-drama' }).id, 'absurd-drama');
  assert.throws(() => selectTopic({ topics, topicId: 'nope' }));
});

test('isPrivateHost는 loopback/사설/예약 대역을 거부한다', () => {
  for (const h of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.5.5', '169.254.169.254', '100.64.1.1', 'localhost', 'foo.local', 'metadata.google.internal', '[::1]', '0.0.0.0', '224.0.0.1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateHost(h), true, h);
  }
  for (const h of ['93.184.216.34', '8.8.8.8', 'example.com']) {
    assert.equal(isPrivateHost(h), false, h);
  }
});

test('detectLanguage는 ko/ja/zh/en/es를 구분한다', () => {
  assert.equal(detectLanguage('한국어 문장이 많이 포함된 페이지입니다. '.repeat(20)), 'ko');
  assert.equal(detectLanguage('これは日本語のガイドです。キャラクターシートを作ります。'.repeat(10)), 'ja');
  assert.equal(detectLanguage('这是一个中文教程页面，介绍如何生成一致的角色。'.repeat(10)), 'zh');
  assert.equal(detectLanguage('This is an English guide about the video generation and how to create a character sheet for your project. '.repeat(6)), 'en');
  assert.equal(detectLanguage('Esta es una guía en español para crear vídeos con la generación de imágenes y cómo diseñar los personajes. '.repeat(6)), 'es');
  assert.equal(detectLanguage('12345 !!!!!'), 'unknown');
});

test('verifyPage는 WAF/로그인/얇은 페이지를 거부한다', () => {
  assert.equal(verifyPage({ title: 'ok', text: 'This is a test page about video generation and how to create consistent character sheets for the project. '.repeat(8) }).ok, true);
  assert.match(verifyPage({ title: 'Just a moment...', text: 'Cloudflare security check ' + 'x'.repeat(500) }).reason, /WAF|차단|blocked/i);
  assert.match(verifyPage({ title: 't', text: 'short' }).reason, /thin-content/);
  assert.match(verifyPage({ title: '', text: 'x'.repeat(600) }).reason, /no-title/);
  assert.match(verifyPage({ title: 't', text: 'x'.repeat(600) }).reason, /language-unknown/);
  assert.match(verifyPage({ title: 'Login', text: 'please sign in to continue ' + 'x'.repeat(500) }).reason, /login/);
});

test('documentIdentity는 현지화 경로를 같은 문서로 묶는다', () => {
  const a = documentIdentity('https://helpx.adobe.com/jp/firefly/how-to/x.html');
  const b = documentIdentity('https://helpx.adobe.com/kr/firefly/how-to/x.html');
  const c = documentIdentity('https://helpx.adobe.com/kr/firefly/how-to/y.html');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ─── safeFetch 경계 ───────────────────────────────────────────────────

test('safeFetch는 비HTTP 리다이렉트와 사설 대상을 차단한다', async () => {
  const ftpRedirect = makeFetch({
    'https://a.example/x': fakeResponse({ status: 302, headers: { location: 'file:///etc/passwd' } })
  });
  await assert.rejects(() => safeFetch('https://a.example/x', { fetchImpl: ftpRedirect, addressLookup: PUBLIC_ADDR }), /blocked-redirect|unsupported-protocol/);

  const privRedirect = makeFetch({
    'https://a.example/y': fakeResponse({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })
  });
  await assert.rejects(() => safeFetch('https://a.example/y', { fetchImpl: privRedirect, addressLookup: PUBLIC_ADDR }), /private-host|private-address/);

  const noFetch = makeFetch({});
  await assert.rejects(() => safeFetch('ftp://a.example/z', { fetchImpl: noFetch, addressLookup: PUBLIC_ADDR }), /unsupported-protocol/);
  await assert.rejects(() => safeFetch('http://127.0.0.1/z', { fetchImpl: noFetch, addressLookup: PUBLIC_ADDR }), /private/);
  await assert.rejects(() => safeFetch('https://user:pass@a.example/', { fetchImpl: noFetch, addressLookup: PUBLIC_ADDR }), /credential/);
});

test('safeFetch는 DNS가 사설 주소로 풀리는 호스트를 차단한다', async () => {
  const evilDns = async () => ['10.0.0.9'];
  const fetchImpl = makeFetch({ 'https://evil.example/': fakeResponse({ body: htmlPage() }) });
  await assert.rejects(() => safeFetch('https://evil.example/', { fetchImpl, addressLookup: evilDns }), /private-address/);
});

// ─── collectResearch ─────────────────────────────────────────────────

test('collectResearch는 5개 언어 검색을 시도하고 2개 언어 이상의 원문을 수집한다', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aiv-research-'));
  const enArticle = 'https://blog.example.com/en/ai-video-characters';
  const koArticle = 'https://maker.example.kr/post/1';
  const routes = {
    'https://html.duckduckgo.com/html/?q=qko': ddgResultsPage([koArticle]),
    'https://html.duckduckgo.com/html/?q=qen': ddgResultsPage([enArticle]),
    'https://html.duckduckgo.com/html/?q=qja': ddgResultsPage([]),
    'https://html.duckduckgo.com/html/?q=qzh': ddgResultsPage(['https://waf.example.com/blocked']),
    'https://html.duckduckgo.com/html/?q=qes': ddgResultsPage([]),
    [enArticle]: fakeResponse({ body: htmlPage({ title: 'Character consistency guide', lang: 'en' }) }),
    [koArticle]: fakeResponse({ body: htmlPage({ title: 'AI 영상 캐릭터 제작법', lang: 'ko' }) }),
    'https://waf.example.com/blocked': fakeResponse({ body: htmlPage({ title: 'Just a moment...', body: 'Cloudflare verify you are human ' + 'x'.repeat(600) }) }),
    'https://helpx.adobe.com/kr/firefly/seed-ko': fakeResponse({ body: htmlPage({ title: '캐릭터 참조 시트 제작 방법', lang: 'ko' }) }),
    'https://support.google.com/flow/answer/16352836?hl=en': fakeResponse({
      status: 301, headers: { location: 'https://support.google.com/flow/answer/16352836?hl=en&sjid=1' }
    }),
    'https://support.google.com/flow/answer/16352836?hl=en&sjid=1': fakeResponse({
      body: htmlPage({ title: 'About video generation in Flow', body: FLOW_DOC_TEXT.repeat(10), lang: 'en' })
    })
  };
  // ddg/bing/google 실패 분기를 함께 보려고 ja/zh/es는 다른 엔진도 비게 둔다.
  for (const engine of ['bing', 'google']) {
    for (const q of ['qja', 'qzh', 'qes']) {
      const url = engine === 'bing'
        ? `https://www.bing.com/search?q=${q}`
        : `https://www.google.com/search?q=${q}`;
      routes[url] = fakeResponse({ body: '<html><body>no results</body></html>' });
    }
  }

  const result = await collectResearch({
    topic, outputDir: outDir,
    fetchImpl: makeFetch(routes),
    addressLookup: PUBLIC_ADDR,
    now: new Date('2026-10-06T09:00:00Z')
  });

  const languages = new Set(result.sources.map((s) => s.language));
  assert.ok(result.ok, `summary ${JSON.stringify(result.summary)}`);
  assert.ok(result.sources.length >= 2);
  assert.ok(languages.size >= 2);
  assert.ok(languages.has('ko') && languages.has('en'));
  // 5개 언어 모두 검색 시도가 기록됐다.
  const langsSearched = new Set(result.searches.map((s) => s.language));
  assert.deepEqual([...langsSearched].sort(), [...SEARCH_LANGUAGES].sort());
  // 빈/차단 결과는 실패로 기록된다.
  assert.ok(result.failures.some((f) => f.stage === 'search'));
  assert.ok(result.failures.some((f) => f.stage === 'fetch' && /WAF|차단|blocked/i.test(f.reason)));
  // 리다이렉트를 따라간 finalUrl이 기록된다.
  const flowSrc = result.sources.find((s) => /16352836/.test(s.finalUrl));
  assert.ok(flowSrc, 'official Flow doc missing');
  assert.match(flowSrc.finalUrl, /sjid=1/);
  // 해시는 실제 추출 텍스트와 일치한다.
  for (const s of result.sources) {
    assert.equal(s.contentSha256, crypto.createHash('sha256').update(s.text, 'utf8').digest('hex'));
    assert.ok(!/<script/i.test(s.text), 'script must be stripped');
    assert.ok(s.retrievedAt);
    assert.ok(['search', 'seed'].includes(s.sourceKind));
  }
  // references 파일이 기록된다.
  const index = JSON.parse(await fs.readFile(path.join(outDir, 'references', 'index.json'), 'utf8'));
  assert.equal(index.sources.length, result.sources.length);
  const first = await fs.readFile(path.join(outDir, 'references', `${result.sources[0].id}.txt`), 'utf8');
  assert.match(first, /SHA256:/);
});

test('collectResearch는 모든 엔진이 실패해도 seed로 수집하고 실패를 숨기지 않는다', async () => {
  const routes = {
    'https://helpx.adobe.com/kr/firefly/seed-ko': fakeResponse({ body: htmlPage({ title: '캐릭터 참조 시트 제작 방법', lang: 'ko' }) }),
    'https://support.google.com/flow/answer/16352836?hl=en': fakeResponse({ body: htmlPage({ title: 'Flow docs', body: FLOW_DOC_TEXT.repeat(10), lang: 'en' }) })
  };
  const result = await collectResearch({
    topic, outputDir: '',
    fetchImpl: makeFetch(routes),
    addressLookup: PUBLIC_ADDR
  });
  assert.ok(result.ok);
  assert.equal(result.sources.length, 2);
  assert.ok(result.searches.filter((s) => s.status === 'error').length >= 5);
  assert.ok(result.failures.filter((f) => f.stage === 'search').length >= 5);
});

test('collectResearch는 근거가 부족하면 ok=false와 coverage 실패를 낸다', async () => {
  const result = await collectResearch({
    topic: { ...topic, seeds: [] }, outputDir: '',
    fetchImpl: makeFetch({}),
    addressLookup: PUBLIC_ADDR
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.stage === 'coverage'));
});

// ─── draftRecipe/validateRecipe ───────────────────────────────────────

function researchFixture({ withFlowDoc = true, flowText = FLOW_DOC_TEXT } = {}) {
  const mk = (id, url, language, text) => ({
    id, url, finalUrl: url, title: 'Character reference and storyboard guide', language,
    retrievedAt: '2026-10-06T09:00:00Z', contentSha256: crypto.createHash('sha256').update(text).digest('hex'),
    text, sourceKind: 'search'
  });
  const sources = [
    mk('src-01', 'https://blog.example.com/en/guide', 'en', 'This guide explains how to create consistent character reference images for storyboard frames. '.repeat(12)),
    mk('src-02', 'https://maker.example.kr/post', 'ko', '캐릭터 참조 이미지를 만들고 카메라 구도와 프레임을 고정하는 제작 방법을 설명한다. '.repeat(12))
  ];
  if (withFlowDoc) {
    sources.push(mk('src-03', 'https://support.google.com/flow/answer/16352836', 'en', flowText.repeat(10)));
  }
  return { ok: true, sources, searches: [], failures: [], summary: {} };
}

function recipeFixture() {
  return {
    title: '고양이 AI 영상 제작: 두 고양이 버디 코미디를 10초 씬으로 설계하는 실전 가이드',
    keyword: '고양이 AI 영상 제작',
    introduction: '10초짜리 짧은 씬 두 개로 완성한 버디 코미디가 긴 한 편보다 가르쳐 주는 것이 많다. 이 글은 새로 만든 두 고양이 캐릭터로 시작·끝 프레임을 고정하고, 씬별 프롬프트를 실제로 생성해 본 과정을 기록한다.',
    synopsis: '낮잠 자는 햄스터 간식 도둑 사건을 두고, 냉정한 탐정 고양이 뭉치와 충동적인 조수 고양이 누리가 서로를 탓하다가 진범을 찾는다. 두 씬의 짧은 버디 코미디다.',
    look: '따뜻한 주방 조명, 35mm 느낌의 얕은 심도, 파스텔톤 미니어처 소품.',
    sections: [
      { heading: '왜 시작과 끝을 먼저 고정하는가', paragraphs: ['생성 모델은 중간을 채우는 데 강하다. 시작과 끝 상태를 이미지로 못 박아 두면 캐릭터가 무너질 범위가 좁아진다.', '여러 언어의 튜토리얼이 공통으로 말하는 것도 이 지점이다 — 긴 한 번의 생성보다 짧은 단위의 확인이 재작업 비용을 줄인다.'] },
      { heading: '캐릭터 시트를 먼저 만드는 이유', paragraphs: ['같은 캐릭터가 두 컷 이상 등장하면 매번 묘사를 새로 쓰는 것보다 참조 시트를 입력하는 편이 일관성이 높다.', '시트는 정면과 측면, 얼굴 클로즈업을 함께 담아 모델이 입체를 추측하게 한다.'] },
      { heading: '씬별 프롬프트 설계', paragraphs: ['한 씬에는 하나의 카메라 움직임과 하나의 사건만 둔다. 대사가 없으면 그 이유를 명시해 무대사가 의도임을 분명히 한다.'] }
    ],
    adaptationNotes: '여러 언어의 튜토리얼에서 캐릭터 참조 시트와 씬 분할 절차를 차용했다. 이야기·캐릭터·프롬프트·결과물은 이 프로젝트에서 새로 만들었다.',
    characters: [
      {
        id: 'char-a', name: '뭉치', persona: '냉정하고 관찰력이 좋은 탐정 고양이. 화날수록 목소리가 낮아진다.',
        description: '회색 얼룩무늬, 녹색 눈, 갈색 탐정 모자.',
        anchors: [...CHARACTER_ANCHORS],
        imagePrompt: 'Character reference sheet of "Mungchi", a grey tabby cat detective with green eyes and a brown deerstalker hat: seven views — full-body front, three-quarter, side, back neutral poses and face close-up front, three-quarter, side, flat lighting, clean white background.'
      },
      {
        id: 'char-b', name: '누리', persona: '충동적이고 낙천적인 조수 고양이. 먼저 뛰고 나중에 생각한다.',
        description: '주황 치즈태비, 호박색 눈, 빨간 목도리.',
        anchors: [...CHARACTER_ANCHORS],
        imagePrompt: 'Character reference sheet of "Nuri", an orange tabby cat assistant with amber eyes and a red scarf: seven views — full-body front, three-quarter, side, back neutral poses and face close-up front, three-quarter, side, flat lighting, clean white background.'
      }
    ],
    scenes: [
      {
        id: 'scene-1', beatId: 'beat-1', shotId: 'shot-1',
        summary: '간식이 사라진 현장을 발견하고 두 고양이가 서로를 의심한다.',
        startState: '텅 빈 간식 그릇 앞에 선 두 고양이의 뒷모습.',
        endState: '뭉치가 누리 쪽으로 몸을 돌리고 누리가 한 발 물러선다.',
        camera: '천천히 다가가는 중간 샷 (slow push-in).',
        spatial: '그릇은 화면 중앙 바닥, 뭉치는 왼쪽, 누리는 오른쪽.',
        vfx: '사용 안 함 — 의심의 긴장은 조명만으로 충분하다.',
        speech: '무대사 — 표정과 시선만으로 의심을 전달한다.',
        audio: '낮은 배경음과 발소리만 계획, 실제 생성 아님.',
        characterIds: ['char-a', 'char-b'],
        startImagePrompt: 'Two cartoon cats viewed from behind standing before an empty snack bowl on a warm kitchen floor, Mungchi the grey tabby detective on the left and Nuri the orange tabby on the right, soft window light, 35mm shallow depth.',
        endImagePrompt: 'Mungchi the grey tabby detective cat turning to accuse Nuri the orange tabby assistant cat who steps back, empty snack bowl between them on the kitchen floor, tense silent moment, warm light.',
        flowPrompt10s: 'A slow push-in on two cartoon cats in a warm kitchen: 0-3s both cats stare at the empty snack bowl; 3-7s Mungchi slowly turns his head toward Nuri; 7-10s Nuri steps back one pace while Mungchi holds the stare. No dialogue, silent comedy timing, single continuous camera move.',
        flowPrompt8s: 'A slow push-in on two cartoon cats in a warm kitchen: 0-3s both cats stare at the empty bowl; 3-5s Mungchi turns toward Nuri; 5-8s Nuri steps back one pace. No dialogue, single camera move.',
        timing10s: '0~3초 빈 그릇 응시, 3~7초 뭉치가 고개를 돌림, 7~10초 누리가 물러남.'
      },
      {
        id: 'scene-2', beatId: 'beat-2', shotId: 'shot-2',
        summary: '진범인 햄스터가 들통나고 두 고양이가 어색하게 화해한다.',
        startState: '커튼 뒤에서 간식을 우적우적 먹는 햄스터가 드러난다.',
        endState: '두 고양이가 서로에게 어색하게 발을 내밀고 햄스터는 도망친다.',
        camera: '커튼을 따라 옆으로 미끄러지는 이동 샷 (lateral slide).',
        spatial: '커튼은 오른쪽, 햄스터는 커튼 뒤, 두 고양이는 왼쪽 전경.',
        vfx: '커튼이 열리는 순간 짧은 반짝임 — 나머지는 없음.',
        speech: '무대사 — 폭로의 타이밍은 침묵이 더 웃기다.',
        audio: '햄스터 씹는 소리 효과음만 계획, 실제 생성 아님.',
        characterIds: ['char-a', 'char-b'],
        startImagePrompt: 'A fat hamster revealed behind a half-open curtain stuffing snacks into its cheeks, two cartoon cats frozen mid-accusation in the left foreground, warm kitchen, comedy reveal moment.',
        endImagePrompt: 'Two cartoon cats awkwardly offering paws to each other while a hamster scurries away behind them, empty snack bowl in the foreground, warm kitchen light, buddy comedy ending beat.',
        flowPrompt10s: 'A lateral slide past a kitchen curtain: 0-3s the camera glides right revealing a hamster eating snacks; 3-7s the two cats stop arguing and look at the hamster; 7-10s the cats awkwardly reach paws to each other as the hamster escapes. Silent comedy, one continuous camera move.',
        flowPrompt8s: 'A lateral slide past a kitchen curtain: 0-3s camera reveals a hamster eating; 3-5s the two cats turn to look; 5-8s the cats awkwardly shake paws as the hamster escapes. Silent comedy, one camera move.',
        timing10s: '0~3초 햄스터 폭로, 3~7초 두 고양이 멈칫, 7~10초 어색한 화해.'
      }
    ],
    sourceIds: ['src-01', 'src-02']
  };
}

test('draftRecipe는 근거 부족·공식 문서 미확인·능력 불일치를 차단한다', async () => {
  const t = topic;
  // 근거 2개 언어 미만
  await assert.rejects(
    () => draftRecipe({ topic: t, research: { sources: [researchFixture().sources[0]] }, callJson: async () => ({}) }),
    /근거 부족/
  );
  // 공식 문서 자체 부재
  const noDoc = researchFixture({ withFlowDoc: false });
  await assert.rejects(
    () => draftRecipe({ topic: t, research: noDoc, callJson: async () => ({}) }),
    /model-capability-needs-review/
  );
  // 문서는 있지만 10초가 빠짐 — 바뀐 문서를 정적 주장으로 넘기지 않는다
  const changed = researchFixture({ flowText: 'Omni Flash 1.1 supports 4, 6, 8 second outputs only. Veo 3.1 supports 8 seconds. ' });
  await assert.rejects(
    () => draftRecipe({ topic: t, research: changed, callJson: async () => ({}) }),
    /model-capability-needs-review/
  );
});

test('checkFlowCapabilities는 읽은 문서 기준으로 판정한다', () => {
  const ok = checkFlowCapabilities(researchFixture(), { now: new Date('2026-10-06T00:00:00Z') });
  assert.ok(ok.checked && ok.omni10s && ok.veo8s);
  assert.equal(ok.checkedAt.slice(0, 10), '2026-10-06');
  const missing = checkFlowCapabilities(researchFixture({ withFlowDoc: false }));
  assert.equal(missing.checked, false);
});


test('validateRecipe는 필수 필드·앵커·언어·금지 주장을 검사한다', () => {
  const research = researchFixture();
  assert.equal(validateRecipe(recipeFixture(), { topic, research }).ok, true);

  const noAnchor = recipeFixture();
  noAnchor.characters[0].anchors = ['정면', '측면', '표정'];
  assert.ok(!validateRecipe(noAnchor, { topic, research }).ok);

  const wrongViews = recipeFixture();
  wrongViews.characters[0].anchors = ['smiling', 'angry', 'sad', 'jumping', 'sleeping', 'dancing', 'crying'];
  const vw = validateRecipe(wrongViews, { topic, research });
  assert.ok(!vw.ok && vw.failures.some((f) => /지정 뷰|앵커|anchors/.test(f)));

  const fourScenes = recipeFixture();
  fourScenes.scenes = [...fourScenes.scenes, ...fourScenes.scenes].slice(0, 4).map((s, i) => ({ ...s, id: `s-${i}` }));
  assert.ok(!validateRecipe(fourScenes, { topic, research }).ok);

  const koreanPrompt = recipeFixture();
  koreanPrompt.scenes[0].flowPrompt10s = '부엌에서 두 고양이가 빈 그릇을 바라보는 장면을 천천히 다가가는 카메라로 촬영한다.';
  assert.ok(!validateRecipe(koreanPrompt, { topic, research }).ok);

  const fakeClaim = recipeFixture();
  fakeClaim.sections[0].paragraphs.push('이 방법으로 영상을 만들어 올렸더니 조회수 100만을 넘었고 수익이 보장됐다.');
  const fc = validateRecipe(fakeClaim, { topic, research });
  assert.ok(!fc.ok && fc.failures.some((f) => /금지 주장|미실행/.test(f)));

  const unknownSource = recipeFixture();
  unknownSource.sourceIds = ['src-99'];
  assert.ok(!validateRecipe(unknownSource, { topic, research }).ok);

  const noTiming = recipeFixture();
  delete noTiming.scenes[0].timing10s;
  assert.ok(!validateRecipe(noTiming, { topic, research }).ok);

  const noChars = recipeFixture();
  noChars.characters = [];
  noChars.scenes.forEach((s) => { s.characterIds = []; });
  assert.equal(validateRecipe(noChars, { topic, research }).ok, true, '캐릭터 없는 광고형 레시피도 허용');
});


test('method coverage excludes homepages, directories and localized copies', () => {
  const research = researchFixture();
  assert.equal(productionSourceCoverage(research.sources).ok, true);
  const homepage = { ...research.sources[0], title: 'AI video platform', url: 'https://openai.com/', finalUrl: 'https://openai.com/' };
  assert.equal(isProductionMethodSource(homepage), false);
  const directory = { ...research.sources[1], title: 'AI 도구 모음', url: 'https://directory.example/tools', finalUrl: 'https://directory.example/tools' };
  assert.equal(isProductionMethodSource(directory), false);
  const localized = { ...research.sources[0], language: 'ja', finalUrl: 'https://blog.example.com/ja/guide' };
  assert.equal(productionSourceCoverage([research.sources[0], localized]).ok, false);
});

test('recipe cannot claim multilingual research when only one language was used', () => {
  const recipe = recipeFixture();
  recipe.sourceIds = ['src-01', 'src-03'];
  assert.equal(validateRecipe(recipe, { topic, research: researchFixture() }).ok, false);
});

test('Chinese site names in adaptation notes fail before image generation', () => {
  const recipe = recipeFixture();
  recipe.adaptationNotes += ' AI工具集을 참고했다.';
  assert.equal(validateRecipe(recipe, { topic, research: researchFixture() }).ok, false);
});
