import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { extractFeedUrls, extractSitemapArticleUrls, inspectArticleHtml, evaluateSiteSurface, runPublicSiteQa } from '../../scripts/content/public-site-qa.mjs';

const GOOD_BODY = `
<div class="contents_style">
  <h1>테스트 글 제목</h1>
  ${'<p>검증된 본문입니다. '.repeat(180)}
  <h2>핵심 내용</h2><p>추가 설명과 출처를 함께 제공합니다.</p>
  <figure><img src="/images/test.webp"><figcaption>설명</figcaption></figure>
</div>`;

test('public article QA blocks automatic refresh and mixed scripts', () => {
  const report = inspectArticleHtml(`
    <html><head><title>테스트</title><meta name="Refresh" content="60">
    <meta name="description" content="테스트 설명"><link rel="canonical" href="https://example.com/1"></head>
    <body><div class="contents_style"><h1>테스트</h1><p>한국어 본문 你好</p></div></body></html>
  `, 'https://example.com/1');
  assert.equal(report.ok, false);
  assert.ok(report.blockerCodes.includes('auto-refresh'));
  assert.ok(report.blockerCodes.includes('mixed-script'));
  assert.ok(report.blockerCodes.includes('thin-body'));
});

test('public article QA blocks copied skin source markers', () => {
  const report = inspectArticleHtml(`
    <html><head><title>테스트</title>
    <meta name="description" content="테스트 설명">
    <meta name="Page-Enter" content="출처: https://webclub.tistory.com/354 [Web Club] 출처: https://webclub.tistory.com/354 [Web Club]">
    <link rel="canonical" href="https://example.com/1"></head>
    <body><div class="contents_style"><h1>테스트</h1>${'<p>충분한 한국어 본문입니다. '.repeat(80)}</div></body></html>
  `, 'https://example.com/1');
  assert.ok(report.blockerCodes.includes('skin-source-marker'));
  assert.ok(report.warningCodes.includes('legacy-page-transition'));
});

test('public article QA blocks leaked markdown links', () => {
  const report = inspectArticleHtml(`
    <html><head><title>테스트</title><link rel="canonical" href="https://example.com/1"></head>
    <body><div class="contents_style"><h1>테스트</h1>
    <p>[참고](https://example.com/guide)</p>${'<p>충분한 한국어 본문입니다. '.repeat(80)}
    </div></body></html>
  `, 'https://example.com/1');
  assert.ok(report.blockerCodes.includes('markdown-leak'));
});

test('public article QA accepts a substantial canonical article', () => {
  const report = inspectArticleHtml(`
    <html><head><title>테스트</title><meta name="description" content="테스트 설명">
    <link rel="canonical" href="https://example.com/1">
    <script type="application/ld+json">{}</script></head><body>${GOOD_BODY}</body></html>
  `, 'https://example.com/1');
  assert.equal(report.ok, true);
  assert.equal(report.bodyChars > 1800, true);
  assert.equal(report.blockerCodes.length, 0);
});

test('feed and sitemap extraction remain bounded and unique', () => {
  assert.deepEqual(
    extractFeedUrls('<item><link>https://example.com/1</link></item><item><link>https://example.com/1</link></item><item><link>https://example.com/2</link></item>', 2),
    ['https://example.com/1', 'https://example.com/2']
  );
  assert.deepEqual(
    extractSitemapArticleUrls('<url><loc>https://example.com/1</loc></url><url><loc>https://example.com/1</loc></url>', 'https://example.com', 10),
    ['https://example.com/1']
  );
});

test('site QA treats missing ads.txt as a scaling blocker', () => {
  const report = evaluateSiteSurface({
    blogUrl: 'https://example.com',
    rootStatus: 200,
    robotsStatus: 200,
    sitemapStatus: 200,
    adsStatus: 404,
    articles: []
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers, [{ code: 'ads-txt-unavailable', status: 404 }]);
});

test('site QA treats Tistory-hosted ads.txt as platform-managed', () => {
  const report = evaluateSiteSurface({
    blogUrl: 'https://acstory.tistory.com',
    rootStatus: 200,
    robotsStatus: 200,
    sitemapStatus: 200,
    adsStatus: 404,
    articles: []
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.warnings, [{ code: 'ads-txt-platform-managed', status: 404 }]);
});

test('RSS failure samples actual sitemap articles after excluding navigation and foreign URLs', async t => {
  let base;
  const server = createServer((request, response) => {
    if (request.url === '/rss') {
      response.writeHead(503);
      response.end('RSS unavailable');
    } else if (request.url === '/sitemap.xml') {
      const urls = [base + '/', base + '/tag', 'https://foreign.invalid/999',
        ...Array.from({ length: 65 }, (_, i) => base + '/category/topic-' + i),
        base + '/1', base + '/entry/original-guide', base + '/2'];
      response.end('<urlset>' + urls.map(url => `<url><loc>${url}</loc></url>`).join('') + '</urlset>');
    } else if (request.url === '/1' || request.url === '/entry/original-guide') {
      response.end(`<html><head><link rel="canonical" href="${base}${request.url}"></head><body>${GOOD_BODY}</body></html>`);
    } else {
      response.end('<html><body>Navigation</body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  base = `http://127.0.0.1:${server.address().port}`;
  const report = await runPublicSiteQa({ blogUrl: base, limit: 2 });
  assert.deepEqual(report.articles.map(article => article.url), [base + '/1', base + '/entry/original-guide']);
  assert.equal(report.surface.verified, true);
  assert.equal(report.surface.blockers.some(item => item.code === 'thin-body'), false);
});
